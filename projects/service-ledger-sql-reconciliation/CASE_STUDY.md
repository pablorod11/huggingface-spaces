# When an order, activation, and invoice disagree

## A fictional service-activation and billing reconciliation

A service marked active in CRM does not establish that service was delivered. An invoice line repeated in an extract does not establish that a customer was charged twice. This project makes those distinctions explicit before assigning an amount to a discrepancy.

This is a synthetic portfolio exercise. It uses no customer data and makes no claim to reproduce a T-Mobile assignment, production system, or realized financial result. The scenario reflects a transferable operations problem: reconcile commercial intent, service delivery evidence, and billing, then route exceptions to the team able to resolve them.

## Decision and scope

The operating question is: **Which September services need investigation, why, and can a billing variance be quantified from the evidence available?**

The fictional contract is one USD full-month base fee per eligible service for September 2026. Every ordered service has a $50.00 plan. CRM and provisioning extracts are immutable source snapshots describing state at the September 30 cutoff; they are not event histories. Evidence is frozen at October 3, 2026, 00:00:00 UTC. The distinction matters: S019 arrives October 2 and qualifies, while S005's activation arrives October 4 and cannot repair this run retrospectively. S018's activation becomes effective October 1 and falls outside September even though it arrives before the evidence freeze.

There are no partial-month activations, proration, taxes, usage charges, credit adjustments, waivers, or historical status transitions in the pricing model. This deliberate simplification makes the checks inspectable; it is not a complete telecom billing policy.

## Verified result

Running `python3 run.py` from this directory rebuilds the SQLite database and exports the evidence. The executed run returned:

- **21 services**, including the unmatched billed service S999.
- **16 exceptions affecting 15 services**. S005 has two findings; counting exception rows as customers would overstate reach.
- **$115.00 potential overcharge** across S007, S009, and S012, where expectation and billed amount are both known.
- **$50.01 potential underbilling** across S008 and S017, on the same known-amount basis.
- **$290.00 billed against unresolved expected states**: S005, S010, S011, S013, S018, and S999. These amounts are investigation exposure, not established overcharges.
- **One service with unknown billing**, S014. Conflicting payloads for its invoice line prevent a trustworthy billed total and exclude it from amount comparisons.

These are separate measures, not an additive savings estimate. No refunds, recovered revenue, or customer remediation have been executed. Neither netting the known variances nor adding the unresolved amounts produces a defensible business benefit claim.

The machine-readable evidence is in `results/reconciliation.csv`, `results/exceptions.csv`, `results/summary.json`, and `results/reconciliation.sqlite`. The exception report carries the rule, owner, business meaning, and next action alongside the source states and amounts.

## How the SQL protects the conclusion

The SQL first freezes scope by business cutoff, billing period, and evidence arrival. It then groups identical business payloads, retaining their source-row count. Ingestion identifiers and arrival times are not business payload attributes: a replay with a different arrival timestamp still counts as a duplicate.

Multiple distinct payloads for a snapshot key are quarantined. The query does not pick the latest status or largest charge. Orders and activations use service identity; charges use invoice-line identity. If any invoice line touching a service is conflicted, that service's billed total is unknown, even if other clean lines exist.

The service population is the union of all three scoped sources. This preserves S999 instead of silently dropping the orphan through an inner join. Clean charge lines are aggregated before joining to services, avoiding multiplication of amounts through join fanout.

Expected billing is $50.00 only when clean CRM and provisioning both say ACTIVE. It is zero when clean CRM is INACTIVE and provisioning is INACTIVE or absent. A missing active-service activation, conflicting source payload, status disagreement, or missing order leaves expectation unknown. A blank expectation is never silently converted to zero. Variance is billed minus expected and is evaluated only when both are known.

## Fixture walkthrough and business interpretation

- **S001, S002, S015 — clean active controls.** The $50.00 expectation matches one $50.00 charge; no exception is warranted.
- **S003 — duplicate charge extract.** The same L003 payload appears twice. Deduplication leaves $50.00, with zero variance. Data engineering investigates replay handling; a refund cannot be justified by this duplicate alone.
- **S004 — duplicate activation extract.** Identical activation rows must not inflate completion counts. Data engineering owns ingestion idempotency; billing remains correct.
- **S005 — late activation plus replayed charge.** October 4 evidence is excluded and the repeated L005 payload is collapsed despite its different arrival timestamp. The two findings go to provisioning operations and data engineering. The $50.00 bill is known, but entitlement to that bill remains unresolved in this run.
- **S006 — no activation or bill.** An active order has no delivery evidence. Provisioning operations investigates; the absence of a bill is not quantified as underbilling while service delivery is unknown.
- **S007 — $65.00 billed against $50.00 expected.** Billing operations reviews the $15.00 positive variance and invoice basis before an adjustment.
- **S008 — active service, no charge.** Both states support a $50.00 expectation. Billing operations checks invoice timing and any approved waiver before treating the $50.00 gap as collectible.
- **S009 — inactive in both snapshots, $50.00 billed.** The zero expectation produces a $50.00 potential overcharge requiring billing review.
- **S010 — conflicting order snapshots.** ACTIVE and INACTIVE CRM payloads coexist. Order operations resolves entitlement; the $50.00 bill cannot yet be judged against a reliable expectation.
- **S011 — CRM active, provisioning inactive.** Service operations determines intended and delivered state. The $50.00 bill is known; the appropriate charge is unresolved.
- **S012 — two distinct $50.00 invoice lines.** L012 and L012B are not extract duplicates. Their $100.00 total exceeds the $50.00 expected base fee by $50.00. Billing operations investigates the actual invoice lines.
- **S013 — conflicting activation snapshots.** Provisioning operations must establish delivered state. Keeping expectation unknown avoids choosing a convenient status to explain the $50.00 bill.
- **S014 — one line, two amounts.** L014 appears as $50.00 and $70.00. Billing operations checks the invoice ledger. Neither amount is selected and no variance is asserted.
- **S016 — clean inactive control.** Both sources say INACTIVE and no charge exists. Zero expected and zero billed is a valid match.
- **S017 — one-cent shortfall.** $49.99 against $50.00 proves integer-cent precision and the deliberately strict zero-tolerance policy. Billing operations reviews the $0.01 exception; a production tolerance would require an explicit policy.
- **S018 — future-effective activation.** October 1 activation cannot establish September delivery. Provisioning operations investigates the September $50.00 bill as an unresolved expectation.
- **S019 — qualifying late-arriving evidence.** September-effective activation received October 2 is included. It reconciles without an exception.
- **S020 — out-of-period charge control.** Its October line is excluded; September remains a $50.00 match.
- **S999 — orphan billing.** A $40.00 charge exists without an eligible order or activation. Order operations traces identity and authorization; the model does not infer a valid obligation or an automatic refund.

The rule catalog also supports duplicate-order detection, although the baseline fixture has no duplicate-order exception. The full-source replay acceptance test exercises this rule separately from the baseline.

## Review and acceptance

The rebuild provides a reproducible evidence trail rather than a screenshot-only result. Acceptance must distinguish duplicate payloads from distinct invoice lines, retain orphans, exclude future-effective and post-freeze evidence, preserve unknown amounts, and verify the exact one-cent variance. Check `ACCEPTANCE_TESTS.md` and the executable acceptance suite supplied with this project for the final test inventory and observed results.

Operational closure would require source evidence, an assigned owner, an approved disposition, and a rerun that demonstrates the correction. A row disappearing because the extraction scope changed would not, by itself, establish resolution.

## Limits and next steps

This small deterministic fixture demonstrates SQL reasoning and exception communication; it does not estimate incident frequency or financial impact in a real portfolio. It assumes consistent service identifiers and normalized UTC timestamps. Source completeness and extraction authenticity are asserted by the exercise, not independently certified.

A production extension should start with agreed source contracts and reconciliation controls: file manifests and hashes, source-to-extract count and amount checks, invoice completeness, explicit billing calendar and grace periods, effective-dated plan and entitlement histories, and documented precedence for valid status transitions. Proration, taxes, credits, waivers, negative lines, currencies, and materiality thresholds need separate business rules before monetary conclusions expand. Conflict resolution should retain provenance and approvals rather than overwrite raw evidence.

An operational queue would add case IDs, evidence links, ownership SLAs, dispositions, adjustment approvals, and rerun history. Reporting can be added when the target role requires it; the SQL and exported evidence are sufficient to inspect this case study without Power BI.
