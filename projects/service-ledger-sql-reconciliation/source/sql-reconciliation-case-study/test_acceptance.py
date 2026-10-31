"""Executable business acceptance tests: python3 -m unittest -v test_acceptance.py."""
import sqlite3
import unittest

from run import build


class ReconciliationAcceptance(unittest.TestCase):
    def setUp(self):
        self.db = build()
        self.addCleanup(self.db.close)

    def row(self, service):
        return self.db.execute('SELECT * FROM reconciliation WHERE service_id=?', (service,)).fetchone()

    def rules(self, service=None):
        if service:
            return {r[0] for r in self.db.execute('SELECT rule FROM exceptions WHERE service_id=?', (service,))}
        return {(r[0], r[1]) for r in self.db.execute('SELECT service_id, rule FROM exceptions')}

    def test_exact_expected_exception_set(self):
        expected = {
            ('S003', 'DUPLICATE_CHARGE'), ('S004', 'DUPLICATE_ACTIVATION'),
            ('S005', 'DUPLICATE_CHARGE'), ('S005', 'MISSING_ACTIVATION'),
            ('S006', 'MISSING_ACTIVATION'), ('S007', 'CHARGE_MISMATCH'),
            ('S008', 'MISSING_CHARGE'), ('S009', 'CHARGE_MISMATCH'),
            ('S010', 'ORDER_CONFLICT'), ('S011', 'STATUS_MISMATCH'),
            ('S012', 'CHARGE_MISMATCH'), ('S013', 'ACTIVATION_CONFLICT'),
            ('S014', 'CHARGE_CONFLICT'), ('S017', 'CHARGE_MISMATCH'),
            ('S018', 'MISSING_ACTIVATION'), ('S999', 'ORPHAN_SERVICE'),
        }
        self.assertEqual(self.rules(), expected)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM exceptions').fetchone()[0], 16)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM reconciliation').fetchone()[0], 21)

    def test_population_and_exception_grains_are_unique(self):
        for view, keys in [('reconciliation', 'service_id,period'), ('exceptions', 'service_id,period,rule')]:
            self.assertEqual(self.db.execute(f'SELECT COUNT(*) FROM (SELECT {keys} FROM {view} GROUP BY {keys} HAVING COUNT(*)>1)').fetchone()[0], 0)

    def test_verified_amounts_and_exposure(self):
        self.assertEqual({s: self.row(s)['variance_cents'] for s in ('S007','S008','S009','S012','S017')},
                         {'S007':1500,'S008':-5000,'S009':5000,'S012':5000,'S017':-1})
        totals = self.db.execute('''SELECT
          SUM(CASE WHEN variance_cents>0 THEN variance_cents ELSE 0 END),
          SUM(CASE WHEN variance_cents<0 THEN -variance_cents ELSE 0 END),
          SUM(CASE WHEN expected_cents IS NULL AND billed_cents IS NOT NULL THEN billed_cents ELSE 0 END)
          FROM reconciliation''').fetchone()
        self.assertEqual(tuple(totals), (11500, 5001, 29000))

    def test_clean_and_inactive_controls(self):
        for service in ('S001','S002','S015','S016','S019','S020'):
            self.assertEqual(self.rules(service), set())
        self.assertEqual(self.row('S016')['expected_cents'], 0)
        self.assertEqual(self.row('S020')['billed_cents'], 5000)

    def test_conflicts_and_disagreement_suppress_uncertain_variances(self):
        for service in ('S005','S006','S010','S011','S013','S014','S018','S999'):
            self.assertIsNone(self.row(service)['variance_cents'])
        self.assertIsNone(self.row('S014')['billed_cents'])
        for service in ('S010','S013','S014'):
            self.assertNotIn('CHARGE_MISMATCH', self.rules(service))
            self.assertNotIn('MISSING_CHARGE', self.rules(service))

    def test_one_cent_mismatch_and_exact_match_boundary(self):
        self.assertEqual(self.row('S017')['variance_cents'], -1)
        self.db.execute("UPDATE charges_raw SET amount_cents=5000 WHERE service_id='S017'")
        self.assertEqual(self.rules('S017'), set())
        self.db.execute("UPDATE charges_raw SET amount_cents=5001 WHERE service_id='S017'")
        self.assertEqual(self.row('S017')['variance_cents'], 1)
        self.assertEqual(self.rules('S017'), {'CHARGE_MISMATCH'})

    def test_replays_do_not_multiply_money(self):
        before = [(r['service_id'],r['expected_cents'],r['billed_cents'],r['variance_cents']) for r in self.db.execute('SELECT * FROM reconciliation ORDER BY service_id')]
        for table in ('orders_raw','activations_raw','charges_raw'):
            columns = [r[1] for r in self.db.execute(f'PRAGMA table_info({table})') if r[1] != 'row_id']
            names = ','.join(columns)
            self.db.execute(f'INSERT INTO {table} ({names}) SELECT {names} FROM {table}')
        after = [(r['service_id'],r['expected_cents'],r['billed_cents'],r['variance_cents']) for r in self.db.execute('SELECT * FROM reconciliation ORDER BY service_id')]
        self.assertEqual(before, after)
        self.assertIn('DUPLICATE_ORDER', self.rules('S001'))

    def test_as_of_is_inclusive_and_one_second_later_is_excluded(self):
        self.db.execute("UPDATE activations_raw SET received_at='2026-10-03T00:00:00Z' WHERE service_id='S005'")
        self.assertNotIn('MISSING_ACTIVATION', self.rules('S005'))
        self.db.execute("UPDATE activations_raw SET received_at='2026-10-03T00:00:01Z' WHERE service_id='S005'")
        self.assertIn('MISSING_ACTIVATION', self.rules('S005'))

    def test_effective_cutoff_is_inclusive(self):
        self.db.execute("UPDATE activations_raw SET effective_at='2026-09-30T23:59:59Z' WHERE service_id='S018'")
        self.assertEqual(self.rules('S018'), set())
        self.db.execute("UPDATE activations_raw SET effective_at='2026-10-01T00:00:00Z' WHERE service_id='S018'")
        self.assertEqual(self.rules('S018'), {'MISSING_ACTIVATION'})

    def test_charges_after_as_of_do_not_enter_current_run(self):
        self.db.execute("UPDATE charges_raw SET received_at='2026-10-03T00:00:01Z' WHERE service_id='S001'")
        self.assertEqual(self.rules('S001'), {'MISSING_CHARGE'})
        self.db.execute("UPDATE charges_raw SET received_at='2026-10-03T00:00:00Z' WHERE service_id='S001'")
        self.assertEqual(self.rules('S001'), set())

    def test_line_conflict_quarantines_every_affected_service(self):
        self.db.execute("INSERT INTO charges_raw(line_id,service_id,period,amount_cents,currency,received_at) VALUES('L001','S002','2026-09',5000,'USD','2026-09-02T00:00:00Z')")
        for service in ('S001','S002'):
            self.assertIn('CHARGE_CONFLICT', self.rules(service))
            self.assertIsNone(self.row(service)['billed_cents'])

    def test_zero_plan_is_not_missing_charge(self):
        self.db.execute("UPDATE orders_raw SET plan_cents=0 WHERE service_id='S008'")
        self.assertEqual(self.rules('S008'), set())
        self.assertEqual(self.row('S008')['variance_cents'], 0)

    def test_rebuild_is_idempotent(self):
        second = build()
        self.addCleanup(second.close)
        for view in ('reconciliation','exceptions'):
            query = f'SELECT * FROM {view} ORDER BY service_id' + (',rule' if view == 'exceptions' else '')
            self.assertEqual([tuple(r) for r in self.db.execute(query)], [tuple(r) for r in second.execute(query)])

    def test_invalid_currency_and_negative_charge_are_rejected(self):
        for amount,currency in [(-1,'USD'),(5000,'EUR')]:
            with self.assertRaises(sqlite3.IntegrityError):
                self.db.execute("INSERT INTO charges_raw(line_id,service_id,period,amount_cents,currency,received_at) VALUES('BAD','S001','2026-09',?,?, '2026-09-02T00:00:00Z')", (amount,currency))

    def test_fractional_and_non_numeric_cents_are_rejected(self):
        for table, column in [('orders_raw', 'plan_cents'), ('charges_raw', 'amount_cents')]:
            for value in (12.5, 'not-money'):
                with self.subTest(table=table, value=value):
                    with self.assertRaises(sqlite3.IntegrityError):
                        self.db.execute(f'UPDATE {table} SET {column}=? WHERE service_id=?', (value, 'S001'))

    def test_only_one_run_configuration_is_allowed(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO run_config VALUES ('2026-10','2026-10-31T23:59:59Z','2026-11-03T00:00:00Z')")
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM run_config').fetchone()[0], 1)

    def test_empty_sources_produce_no_phantom_services(self):
        for table in ('orders_raw', 'activations_raw', 'charges_raw'):
            self.db.execute(f'DELETE FROM {table}')
        for view in ('service_population', 'reconciliation', 'exceptions'):
            self.assertEqual(self.db.execute(f'SELECT COUNT(*) FROM {view}').fetchone()[0], 0)

    def test_inactive_order_without_activation_has_zero_expectation(self):
        self.db.execute("DELETE FROM activations_raw WHERE service_id='S016'")
        self.assertEqual(self.row('S016')['expected_cents'], 0)
        self.assertEqual(self.row('S016')['variance_cents'], 0)
        self.assertEqual(self.rules('S016'), set())


if __name__ == '__main__':
    unittest.main()
