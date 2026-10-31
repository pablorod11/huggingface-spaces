# Acceptance specification and review record

Run `python3 run.py` for the full rebuild, acceptance receipt, and page regeneration. `python3 -m unittest -v test_acceptance.py` runs the suite independently. The actual count and pass/fail status are in `results/acceptance.json`; no test pass is inferred from a screenshot.

## Baseline acceptance

1. Exactly 21 unique service/month rows, preserving S999 from the full source union.
2. Exactly 16 unique service/month/rule findings across 15 services; S005 has two findings.
3. Exact exception membership matches the fixture oracle in `test_exact_expected_exception_set`, rather than merely matching a total.
4. Clean active controls S001, S002, S015, S019, S020 and inactive control S016 have no findings.
5. Positive known variances: S007 +1500, S009 +5000, S012 +5000 cents. Negative: S008 −5000, S017 −1 cent.
6. Unknown expected states remain unknown. S014 has unknown billing, with no fabricated zero, selected winning charge, or monetary variance.
7. The summary yields 11500 cents potential overcharge, 5001 cents potential underbilling, and 29000 cents of known bills with unknown expectations. Overlapping exceptions never enter the monetary sum.

## Mutation and boundary acceptance

The tests start from a fresh in-memory database and change individual inputs, leaving the delivered fixtures unchanged.

- Replay all three extracts: canonical money remains identical, while duplicate rules fire. This exercises duplicate-order detection beyond the baseline.
- Move S017 from −1 cent to exact match to +1 cent: zero tolerance and variance sign remain correct.
- Put S005 evidence exactly at the inclusive freeze and one second beyond: only qualifying evidence clears the missing activation.
- Put S018 activation at the final eligible second and immediately after: eligibility changes as specified. Full-month fee expectation remains contractual, not prorated.
- Move a charge beyond the freeze and back to the boundary: it is excluded and then restored.
- Reassign an existing invoice-line ID to a second service: all services touched by the conflict have unknown billing.
- Set the plan to zero: no false missing-charge finding.
- Rebuild twice: row-level reconciliation and exception outputs remain identical.
- Reject unsupported currency, negative or non-integer cents, and a second configuration period.
- Remove all source data: no phantom services or exceptions.
- Inactive CRM with no activation and no charge: known zero expectation, no false missing activation.

Each test has assertions in the executable suite. This document describes acceptance behavior; `results/acceptance.json` records which tests actually ran.

## Review and presentation checks

SQL review found no blocker under the single-month snapshot and full-month pricing contract. Business review traced every fixture to a discrepancy meaning, source owner, and next action. Design review checked the semantic structure, tab behavior, print visibility of service identifiers, contrast choices, responsive CSS breakpoints, and source bindings by code inspection.

The offline page embeds the actual CSV evidence, executable SQL, computed summary, and test receipt. It makes no external network calls. Search and filters operate on the embedded exception array; raw-source drilldowns intentionally retain excluded evidence with an explanation. SQL predicates are extracted from the executed query file.

An additional Node.js VM smoke test (`node test_ui.cjs`) passed seven code-only interaction groups: initial metrics, service search, owner filtering, empty state, conflict drilldown, close/focus, and keyboard SQL tabs. This uses simulated DOM elements and does not establish actual browser behavior or visual rendering. A static audit also verified unique HTML IDs, all local file links and section anchors, JavaScript syntax, and embedded evidence bindings.

Browser security blocked local `file:` preview. The shell environment also denied local server binding. **Rendered visual and browser interaction acceptance remains unverified.** No screenshot or cross-browser pass is claimed. To complete it locally, open `index.html` in a browser and check:

1. Desktop and narrow phone layouts: navigation, metric labels, and scrollable table remain readable.
2. Search S005: two findings; rule and owner filters combine; an unmatched search yields a clear empty state.
3. Select S014: unknown billed amount, raw conflicting amounts, business meaning, and exact rule predicate are visible.
4. Keyboard: all controls are reachable, tabs respond to left/right arrows, focus enters detail and returns to the service on close.
5. Schema/check tabs change the displayed source; links and CSV downloads resolve locally; print retains service identifiers.

No public deployment, employer data, billing write, or financial adjustment was performed.
