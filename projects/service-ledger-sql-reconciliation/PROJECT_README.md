# ServiceLedger — SQL reconciliation case study

**A fictional operations portfolio project connecting service activation, commercial status, and billing.** It demonstrates SQL checks, exception handling, business interpretation, data definitions, and executable acceptance tests. It does not recreate any employer assignment or use customer data.

Open **[index.html](index.html)** in a browser for the offline case-study workbench. Search exceptions, filter by rule or owner, select a service to inspect its raw evidence and detecting SQL, and inspect the acceptance results. No external requests, installation, login, or web server are required.

## Reproduce

Requires Python 3.9+ with its bundled SQLite 3.25+; no third-party packages.

From this directory:

```sh
python3 run.py
```

The command loads the CSV fixtures into a fresh in-memory database, executes the SQL, exports the reconciliation and enriched exception report, runs the acceptance suite, and regenerates the offline HTML page. It exits nonzero if acceptance fails. `results/` contains generated evidence, not hand-entered results.

To run tests alone:

```sh
python3 -m unittest -v test_acceptance.py
```

To refresh the machine-readable acceptance receipt without rebuilding other exports:

```sh
python3 verify.py
```

After editing fixtures or rules, run `python3 run.py` again and reopen the page. Re-running tests alone does not rebuild the page. CSVs use empty cells for unknown amounts; preserve their distinction from zero.

## What the example finds

The baseline contains 20 fictional service orders plus one orphan billed service. It produces **16 exceptions across 15 of 21 service IDs**:

- **$115.00 potential overcharge:** $15.00 plan mismatch, $50.00 inactive-service bill, and $50.00 from a second distinct invoice line.
- **$50.01 potential underbilling:** one absent $50.00 charge and one $0.01 shortfall.
- **$290.00 known billing with unverified expected states.** This belongs in an investigation queue, not a savings calculation.
- **One unknown billed amount:** conflicting invoice payloads for S014 are quarantined from monetary totals.

An exact replay of the same invoice-line ID is a data-quality finding. A second distinct invoice-line ID contributes to billed amounts. Neither finding authorizes a refund or a new customer charge.

## Inspect the project

- [Business case and fixture walkthrough](CASE_STUDY.md): discrepancy → implication → owner → next action.
- [Data dictionary](DATA_DICTIONARY.md): grains, clocks, source authority, cents, unknowns, and definitions.
- [Schema](sql/01_schema.sql) and [reconciliation SQL](sql/02_reconcile.sql): scope → deduplicate → quarantine → compare → route.
- [Investigation queries](sql/03_investigate.sql): ready-to-run operational checks against the generated database.
- [Exception report](results/exceptions.csv), [full reconciliation](results/reconciliation.csv), and [SQLite database](results/reconciliation.sqlite).
- [Acceptance specification](ACCEPTANCE_TESTS.md), [executable tests](test_acceptance.py), and [saved test receipt](results/acceptance.json).
- [References and architecture decisions](REFERENCES.md): reviewed GitHub sources and scope decisions.
- `data/`: fictional source extracts and the business-rule catalog. `page.template.html` + `render.py`: offline presentation. `run.py`: load and export only; the reconciliation logic stays in SQL.

## Assumptions and practical limits

This is one monthly snapshot run, enforced by a single-run configuration index. All orders are due September 1. The pricing contract is a full-month USD base fee with zero-cent tolerance. It deliberately excludes proration, taxes, usage fees, credits, waivers, currencies, and status history. Even an isolated test activation at the final second of the month uses this flat contractual expectation; the query does not calculate elapsed service days.

Cutoff: September 30, 2026 at 23:59:59 UTC. Evidence freeze: October 3 at 00:00:00 UTC, inclusive. Dates must be normalized UTC ISO timestamps. Input fixture validity and source completeness are assumed; monetary types, nonnegative inputs, statuses, currency, and single-run configuration have database constraints. This is a small batch demonstration, not a production ingestion service.

No Power BI workbook is included because no reporting-focused target role was specified. The SQL and CSV outputs can support one later.

## Validation and review

Independent reviews covered SQL correctness, business interpretation, and design/code polish. The acceptance receipt records the executed test count and results. Tests cover the exact expected output and isolated changes to timing, duplicates, conflicting keys, monetary precision, constraints, and population handling.

**Presentation limitation:** browser security blocked local-file preview, and this environment could not bind a local preview server. Layout, semantic markup, local links, payload bindings, and interactions were checked in source; the page has not received rendered desktop/mobile visual acceptance. See the final review notes in [ACCEPTANCE_TESTS.md](ACCEPTANCE_TESTS.md).

Optional presentation logic check, if Node.js is installed: `node test_ui.cjs`. It uses a simulated DOM, not a browser.

## Portfolio description

“Built a reproducible SQL reconciliation using synthetic service and billing snapshots; separated extract duplicates from invoice discrepancies, quarantined conflicting evidence, and produced an owned exception queue with business implications and automated acceptance tests.”

Use it as a project description, not a claim of production experience or realized savings.
