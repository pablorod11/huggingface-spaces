"""Rebuild a fictional September reconciliation. Python 3.9+, no packages required."""
from pathlib import Path
import csv
import json
import sqlite3

ROOT = Path(__file__).resolve().parent

def build():
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.executescript((ROOT / 'sql/01_schema.sql').read_text())
    for name in ('orders', 'activations', 'charges', 'rules'):
        with (ROOT / 'data' / f'{name}.csv').open(newline='') as f:
            reader = csv.DictReader(f)
            fields = reader.fieldnames
            db.executemany(f"INSERT INTO {'rule_catalog' if name == 'rules' else name + '_raw'} ({','.join(fields)}) VALUES ({','.join('?' for _ in fields)})",
                           [tuple(row[key] for key in fields) for row in reader])
    db.executescript((ROOT / 'sql/02_reconcile.sql').read_text())
    return db

def export(db):
    out = ROOT / 'results'
    out.mkdir(exist_ok=True)
    for view in ('reconciliation', 'exceptions'):
        rows = db.execute(f'SELECT * FROM {view} ORDER BY service_id' + (', rule' if view == 'exceptions' else '')).fetchall()
        with (out / f'{view}.csv').open('w', newline='') as f:
            w = csv.writer(f)
            w.writerow(rows[0].keys() if rows else [x[0] for x in db.execute(f'SELECT * FROM {view}').description])
            w.writerows(rows)
    target = sqlite3.connect(out / 'reconciliation.sqlite')
    db.backup(target)
    target.close()
    rows = [dict(r) for r in db.execute('SELECT * FROM exceptions ORDER BY service_id, rule')]
    summary = dict(db.execute('''SELECT COUNT(*) AS services,
      SUM(CASE WHEN variance_cents>0 THEN variance_cents ELSE 0 END) AS potential_overcharge_cents,
      SUM(CASE WHEN variance_cents<0 THEN -variance_cents ELSE 0 END) AS potential_underbilling_cents,
      SUM(CASE WHEN expected_cents IS NULL AND billed_cents IS NOT NULL THEN billed_cents ELSE 0 END) AS unverified_billed_cents,
      SUM(charge_conflict) AS services_with_unknown_billing
      FROM reconciliation''').fetchone())
    summary.update(exception_count=len(rows), affected_services=len({r['service_id'] for r in rows}))
    (out / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))
    return rows, summary

if __name__ == '__main__':
    db = build()
    exceptions, summary = export(db)
    db.close()
    from verify import verify
    from render import render
    acceptance, success = verify()
    render(exceptions, summary, acceptance)
    raise SystemExit(0 if success else 1)
