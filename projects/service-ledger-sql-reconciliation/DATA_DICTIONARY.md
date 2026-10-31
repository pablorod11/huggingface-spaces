# Data definitions and reconciliation contract

## Period, clocks, and units

The single configured run is September 2026 (`2026-09`). The business cutoff is `2026-09-30T23:59:59Z`; the inclusive evidence freeze is `2026-10-03T00:00:00Z`. These UTC timestamps are normalized ISO strings so SQLite lexical comparisons match chronological order. “Through October 3” means through midnight at the start of that day, not its end.

Amounts are nonnegative USD integer cents in the raw data: `5000` means $50.00. Signed variances are also integer cents. There is no floating-point money and no rounding tolerance. The policy covers one full-month base fee only. Status snapshots describe state at cutoff; effective and due dates establish eligibility, not an event sequence.

## Raw inputs and authority

`orders_raw` is the commercial snapshot. Its intended business grain is one payload per `service_id`. It supplies plan price and CRM intent. Fields: `row_id` is a technical import identity; `service_id` is the cross-source service key; `plan_cents` is the agreed monthly base fee; `crm_status` is ACTIVE or INACTIVE; `due_at` is the order eligibility timestamp; `received_at` is evidence arrival. Rows qualify when due by cutoff and received by freeze. `row_id` is allocated by SQLite during CSV loading and is not in the source CSV.

`activations_raw` is the provisioning snapshot. Its intended business grain is one payload per `service_id`. It supplies delivered-service evidence, not commercial entitlement. Fields: technical `row_id`; cross-source `service_id`; `service_status` ACTIVE or INACTIVE; `effective_at` for service-state eligibility; `received_at` for evidence arrival. Rows qualify when effective by cutoff and received by freeze. Multiple distinct eligible payloads are conflicts, not historical transitions.

`charges_raw` is the invoice-line extract. Its intended business grain is one payload per `line_id`; a service can have multiple different lines. Fields: technical `row_id`; `line_id` invoice-line business identity; `service_id`; `period` in YYYY-MM format; `amount_cents`; `currency`, constrained to USD; and `received_at`. Rows qualify for the configured billing period and evidence freeze. A missing clean charge is represented as zero only when there is no conflicted line for that service.

`rule_catalog` has one row per `rule`. `severity` prioritizes investigation, `owner` assigns the functional team, `business_meaning` explains the operational consequence, and `next_action` describes the initial investigation. Severity is configured, not calculated from dollar size; even the one-cent fixture is High under this deliberately strict catalog.

`run_config` has one row per `period`, with `cutoff` and `as_of` timestamps. A unique expression index enforces exactly one configured run at a time; the cross joins are not designed for multiple simultaneous periods.

No source is universally authoritative. Orders answer what was commercially intended and priced; provisioning answers what service evidence exists; billing answers what invoice lines were extracted. Disagreement remains an exception until an owner resolves it. The synthetic pricing contract combines these sources to determine an expectation; it does not let one source overwrite another.

## Intermediate views

`orders_scope`, `activations_scope`, and `charges_scope` retain qualifying raw rows. The `*_distinct` views group identical business payloads and retain `source_rows`, the count of raw repetitions. Technical identity and arrival time are excluded from payload equality. Order payload equality uses service, plan, CRM status, and due date; activation equality uses service, service status, and effective date; charge equality uses line, service, period, amount, and currency.

`order_conflicts` and `activation_conflicts` contain services with more than one distinct payload. `charge_conflicts` contains invoice-line keys with more than one distinct payload, including a hypothetical line reassigned between services. `*_clean` excludes conflicted keys entirely. `charge_totals` sums distinct clean line amounts per service and counts those lines. `service_population` is the union of scoped service keys across every source, preserving unmatched rows.

Duplicate findings and billing discrepancies are separate concepts. Repeating the same invoice-line payload indicates a data repetition. Two different invoice-line IDs are additive billing evidence even when all other values match. A line ID with differing payloads is a conflict and cannot be safely summed.

## Reconciliation output

`reconciliation` has one row per service and configured period. It contains:

- `service_id`, `period`: output business key.
- `plan_cents`, `crm_status`, `service_status`: values from clean eligible snapshots; blank when absent or quarantined.
- `has_order`, `has_activation`: 1 when any eligible raw row exists, including conflicted evidence; otherwise 0.
- `order_conflict`, `activation_conflict`, `charge_conflict`: integer Boolean flags. A charge conflict marks every service touched by a conflicting line.
- `clean_billed_cents`: sum of unconflicted distinct invoice lines, or zero if none. This diagnostic subtotal is **not** a trustworthy total when `charge_conflict=1`.
- `line_count`: number of unconflicted distinct lines; zero may coexist with unknown billing.
- `billed_cents`: clean subtotal when no charge conflict exists; otherwise NULL.
- `expected_cents`: plan price when clean CRM and provisioning both say ACTIVE; zero for a clean INACTIVE order with an INACTIVE or absent activation; otherwise NULL.
- `variance_cents`: billed minus expected only when both are known. Positive means potential overcharge; negative means potential underbilling; zero means an amount match. NULL means insufficient evidence, not a zero discrepancy.

A NULL appears as an empty field in exported CSV. Consumers must preserve the difference between empty and zero.

## Exception output and summary measures

`exceptions` has one row per `service_id`, `period`, and `rule`, with the relevant states, expected amount, billed amount, variance, severity, owner, business meaning, and next action. Multiple findings can apply to one service. `exception_keys` uses UNION to avoid repeated copies of the same rule for the same service.

Duplicate rules fire when an identical payload has `source_rows > 1`. Conflict rules fire on quarantined keys. `ORPHAN_SERVICE` means there is no eligible order. `MISSING_ACTIVATION` means a clean ACTIVE CRM order lacks eligible provisioning evidence. `STATUS_MISMATCH` requires clean but different CRM and provisioning statuses. `MISSING_CHARGE` requires a positive known expectation and zero known billing. `CHARGE_MISMATCH` requires known expectation, positive known billing, and nonzero variance. Missing-charge cases are therefore not also charge-mismatch cases.

`summary.json` counts the union population, exception rows, and distinct affected services. Potential overcharge sums positive known variances; potential underbilling sums absolute negative known variances. `unverified_billed_cents` sums known bills whose expectation is NULL, including zero-billed unresolved rows without increasing the total. `services_with_unknown_billing` counts charge-conflicted services, whose amounts are excluded from known billing totals. These measures must not be added together or presented as realized revenue recovery.

## Ownership and action

Data engineering owns extract duplicates and replay controls. Order operations owns order conflicts and orphan identity or entitlement. Provisioning operations owns missing or conflicting activation evidence. Service operations owns clean cross-source status disagreement. Billing operations owns missing charges, known amount mismatches, and invoice-line conflicts. All monetary findings require invoice and policy review before an approved adjustment.

See `CASE_STUDY.md` for every planted service scenario and the executed result totals. The SQL in `sql/01_schema.sql` and `sql/02_reconcile.sql` is the executable definition; these descriptions deliberately preserve its unknown-state and quarantine behavior.
