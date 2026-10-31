-- Open results/reconciliation.sqlite, then execute any query below.
-- Known monetary variances, independently of overlapping exception rows.
SELECT service_id, expected_cents, billed_cents, variance_cents
FROM reconciliation WHERE variance_cents <> 0 ORDER BY ABS(variance_cents) DESC;

-- Actionable exception queue, routed by the rule catalog.
SELECT service_id, rule, severity, owner, business_meaning, next_action
FROM exceptions ORDER BY owner, service_id, rule;

-- Source replay diagnostic: extra copies after collapsing identical payloads.
SELECT 'orders' AS source, SUM(source_rows-1) AS extra_rows FROM orders_distinct
UNION ALL SELECT 'activations', SUM(source_rows-1) FROM activations_distinct
UNION ALL SELECT 'charges', SUM(source_rows-1) FROM charges_distinct;

-- Invoice conflicts: inspect both payloads, never select an arbitrary winner.
SELECT * FROM charges_distinct WHERE line_id IN (SELECT line_id FROM charge_conflicts);

-- Controls: all should be zero (the second query counts missing catalog entries).
SELECT COUNT(*) AS duplicate_output_keys FROM (
 SELECT service_id, period, rule FROM exceptions GROUP BY service_id, period, rule HAVING COUNT(*)>1
);
SELECT COUNT(*) AS undefined_rules FROM exception_keys k LEFT JOIN rule_catalog r USING(rule) WHERE r.rule IS NULL;
