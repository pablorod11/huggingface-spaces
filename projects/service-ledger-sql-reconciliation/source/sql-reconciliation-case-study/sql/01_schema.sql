-- SQLite 3.25+; source extracts intentionally permit business-key duplicates.
CREATE TABLE run_config (period TEXT PRIMARY KEY, cutoff TEXT NOT NULL, as_of TEXT NOT NULL);
CREATE UNIQUE INDEX one_run_only ON run_config((1));
INSERT INTO run_config VALUES ('2026-09','2026-09-30T23:59:59Z','2026-10-03T00:00:00Z');
CREATE TABLE orders_raw (row_id INTEGER PRIMARY KEY, service_id TEXT NOT NULL,
 plan_cents INTEGER NOT NULL CHECK(typeof(plan_cents)='integer' AND plan_cents >= 0), crm_status TEXT NOT NULL CHECK(crm_status IN ('ACTIVE','INACTIVE')),
 due_at TEXT NOT NULL, received_at TEXT NOT NULL);
CREATE TABLE activations_raw (row_id INTEGER PRIMARY KEY, service_id TEXT NOT NULL,
 service_status TEXT NOT NULL CHECK(service_status IN ('ACTIVE','INACTIVE')), effective_at TEXT NOT NULL, received_at TEXT NOT NULL);
CREATE TABLE charges_raw (row_id INTEGER PRIMARY KEY, line_id TEXT NOT NULL, service_id TEXT NOT NULL,
 period TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents >= 0), currency TEXT NOT NULL CHECK(currency='USD'),
 received_at TEXT NOT NULL);
CREATE TABLE rule_catalog (rule TEXT PRIMARY KEY, severity TEXT NOT NULL, owner TEXT NOT NULL,
 business_meaning TEXT NOT NULL, next_action TEXT NOT NULL);
