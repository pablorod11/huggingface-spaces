-- 1. Freeze the evidence clock before comparing sources. ISO UTC timestamps compare lexically.
CREATE VIEW orders_scope AS SELECT o.* FROM orders_raw o, run_config c
WHERE o.received_at <= c.as_of AND o.due_at <= c.cutoff;
CREATE VIEW activations_scope AS SELECT a.* FROM activations_raw a, run_config c
WHERE a.received_at <= c.as_of AND a.effective_at <= c.cutoff;
CREATE VIEW charges_scope AS SELECT b.* FROM charges_raw b, run_config c
WHERE b.received_at <= c.as_of AND b.period = c.period;

-- 2. Collapse only identical business payloads. Arrival metadata is not a business attribute.
CREATE VIEW orders_distinct AS SELECT service_id, plan_cents, crm_status, due_at,
 COUNT(*) AS source_rows FROM orders_scope GROUP BY service_id, plan_cents, crm_status, due_at;
CREATE VIEW activations_distinct AS SELECT service_id, service_status, effective_at,
 COUNT(*) AS source_rows FROM activations_scope GROUP BY service_id, service_status, effective_at;
CREATE VIEW charges_distinct AS SELECT line_id, service_id, period, amount_cents, currency,
 COUNT(*) AS source_rows FROM charges_scope GROUP BY line_id, service_id, period, amount_cents, currency;

-- These extracts are snapshots, not histories. Multiple payloads per key are unresolved conflicts.
CREATE VIEW order_conflicts AS SELECT service_id FROM orders_distinct GROUP BY service_id HAVING COUNT(*) > 1;
CREATE VIEW activation_conflicts AS SELECT service_id FROM activations_distinct GROUP BY service_id HAVING COUNT(*) > 1;
CREATE VIEW charge_conflicts AS SELECT line_id FROM charges_distinct GROUP BY line_id HAVING COUNT(*) > 1;
CREATE VIEW orders_clean AS SELECT * FROM orders_distinct WHERE service_id NOT IN (SELECT service_id FROM order_conflicts);
CREATE VIEW activations_clean AS SELECT * FROM activations_distinct WHERE service_id NOT IN (SELECT service_id FROM activation_conflicts);
CREATE VIEW charges_clean AS SELECT * FROM charges_distinct WHERE line_id NOT IN (SELECT line_id FROM charge_conflicts);
CREATE VIEW charge_totals AS SELECT service_id, SUM(amount_cents) AS billed_cents, COUNT(*) AS line_count
FROM charges_clean GROUP BY service_id;

-- 3. Full population preserves unmatched rows. Pre-aggregate charges to avoid join fanout.
CREATE VIEW service_population AS
SELECT service_id FROM orders_scope UNION SELECT service_id FROM activations_scope UNION SELECT service_id FROM charges_scope;
CREATE VIEW reconciliation AS
WITH joined AS (
 SELECT p.service_id, c.period, o.plan_cents, o.crm_status, a.service_status,
  EXISTS(SELECT 1 FROM orders_scope x WHERE x.service_id=p.service_id) AS has_order,
  EXISTS(SELECT 1 FROM activations_scope x WHERE x.service_id=p.service_id) AS has_activation,
  EXISTS(SELECT 1 FROM order_conflicts x WHERE x.service_id=p.service_id) AS order_conflict,
  EXISTS(SELECT 1 FROM activation_conflicts x WHERE x.service_id=p.service_id) AS activation_conflict,
  EXISTS(SELECT 1 FROM charges_distinct x JOIN charge_conflicts y USING(line_id) WHERE x.service_id=p.service_id) AS charge_conflict,
  COALESCE(b.billed_cents,0) AS clean_billed_cents, COALESCE(b.line_count,0) AS line_count
 FROM service_population p CROSS JOIN run_config c
 LEFT JOIN orders_clean o USING(service_id) LEFT JOIN activations_clean a USING(service_id)
 LEFT JOIN charge_totals b USING(service_id)
), evaluated AS (
 SELECT *, CASE WHEN charge_conflict=0 THEN clean_billed_cents END AS billed_cents,
 CASE WHEN has_order=0 OR order_conflict=1 OR activation_conflict=1 THEN NULL
      WHEN crm_status='INACTIVE' AND (service_status='INACTIVE' OR has_activation=0) THEN 0
      WHEN crm_status='ACTIVE' AND service_status='ACTIVE' THEN plan_cents
      ELSE NULL END AS expected_cents
 FROM joined
)
SELECT *, CASE WHEN expected_cents IS NOT NULL AND billed_cents IS NOT NULL
 THEN billed_cents-expected_cents END AS variance_cents FROM evaluated;

-- 4. One exception per service, period and rule; overlapping findings are intentional.
CREATE VIEW exception_keys AS
SELECT service_id, period, 'DUPLICATE_ORDER' AS rule FROM orders_distinct CROSS JOIN run_config WHERE source_rows>1
UNION SELECT service_id, period, 'DUPLICATE_ACTIVATION' FROM activations_distinct CROSS JOIN run_config WHERE source_rows>1
UNION SELECT service_id, period, 'DUPLICATE_CHARGE' FROM charges_distinct WHERE source_rows>1
UNION SELECT service_id, period, 'ORDER_CONFLICT' FROM reconciliation WHERE order_conflict=1
UNION SELECT service_id, period, 'ACTIVATION_CONFLICT' FROM reconciliation WHERE activation_conflict=1
UNION SELECT service_id, period, 'CHARGE_CONFLICT' FROM reconciliation WHERE charge_conflict=1
UNION SELECT service_id, period, 'ORPHAN_SERVICE' FROM reconciliation WHERE has_order=0
UNION SELECT service_id, period, 'MISSING_ACTIVATION' FROM reconciliation
 WHERE has_order=1 AND order_conflict=0 AND crm_status='ACTIVE' AND has_activation=0
UNION SELECT service_id, period, 'STATUS_MISMATCH' FROM reconciliation
 WHERE order_conflict=0 AND activation_conflict=0 AND has_order=1 AND has_activation=1 AND crm_status<>service_status
UNION SELECT service_id, period, 'MISSING_CHARGE' FROM reconciliation WHERE expected_cents>0 AND billed_cents=0
UNION SELECT service_id, period, 'CHARGE_MISMATCH' FROM reconciliation
 WHERE expected_cents IS NOT NULL AND billed_cents>0 AND variance_cents<>0;
CREATE VIEW exceptions AS SELECT k.*, r.crm_status, r.service_status, r.expected_cents,
 r.billed_cents, r.variance_cents, d.severity, d.owner, d.business_meaning, d.next_action
FROM exception_keys k JOIN reconciliation r USING(service_id,period) JOIN rule_catalog d USING(rule);
