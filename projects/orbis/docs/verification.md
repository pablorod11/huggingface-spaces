# Infrastructure verification — November 4, 2026

This record covers the Infrastructure BizOps redesign. All records and local integration fixtures are synthetic; no external notifications or recurring jobs were activated.

## Automated checks

- `npm test`: 50 JavaScript tests passed, zero failures/skips. Includes the original compatibility suite, 11 infrastructure analytical cases, infrastructure state/source-selection cases, and schedule preservation.
- `npm run check`: all seven application ES modules pass syntax checks.
- `python3 -B -m unittest discover -s tests -p 'test_*.py'`: all 20 Python tests passed, including the original 15 companion tests and new infrastructure schema/connector/export/parity coverage.
- Deterministic fixture: 54,216 facts, 11,966,888 CSV bytes; 729 daily and 24 hourly intervals per each of 72 allocated cohorts. Exact source coverage [2024-11-03T00:00:00Z,2026-11-03T00:00:00Z).
- Independent Python Decimal last-30-day totals reconcile with JavaScript: revenue USD 151,352.6040; total infrastructure cost USD 8,210.351544; contribution USD 143,142.252456; capacity-hour weighted CPU 58.568967714%. The source has full 365-day current and prior YoY coverage, and exactly 24 hourly buckets in Last 24h.

## Independent review

Four material findings were repaired and re-reviewed: hourly timestamp alignment parity between Python and JavaScript; future/fetch freshness parity; utility source-selection reset leading to the wrong dry-run source; and inconsistent 85% saturation thresholds. The scoped final review found no remaining blocker in those repairs. Regression assertions accompany the analytical, state and schema fixes.

## Real-browser evidence

- All three tabs rendered with one fixed global header, Last 30d default and the required environment/provider-region/tier choices.
- Production plus AWS/GCP and two regions persisted into Capacity and Unit economics tabs, then survived a full reload. Provider and region choices intersect correctly.
- Last 24h uses hourly data. It showed a synthetic AWS target breach (98.949% success versus 99.798% target); three-decimal rate display avoids rounding away service-level differences.
- YoY shows full current/prior coverage and a daily transaction forecast with a displayed 3.2% holdout MAPE. The hourly view abstains from daily forecasting. QTD starts at October 1, 2026.
- The scenario recalculated from baseline 81.6% CPU to 163.3% under +100% demand, showing negative headroom and extra required capacity rather than clamping impossible demand to a healthy value.
- A saved view survived reload. An AWS-only CSV download contained exactly 954 AWS facts; exported costs reconciled to USD 3,083.524404.
- A malformed CSV produced an actionable schema error and retained the previous source.
- A two-source loopback companion loaded source B and retained B through utility rebuilds. Dry-run execution logs recorded sourceId infra-b and successful local exports. No external delivery or scheduler was started.
- At 390px, document width equals viewport width, the full-width header stays at top 0 on scroll, and its 126px measured height reserves content space. Provider/region dropdown fits the viewport. Charts use a readable 480-unit SVG layout. Desktop behavior was checked at 1440px.

## Scope and limits

Statistical estimates are not causal insights or calibrated guarantees. Historical vendor prices, commitments and service targets are synthetic. Daily intervals do not measure individual-host or intra-day peaks. Partial-interval exports are analytical estimates and may not reimport as raw strict-schema facts; use the original source to reimport. Actual PostgreSQL and semantic credentials were unavailable, so those adapters were mock-tested; SQLite was exercised end to end.

Free static hosting cannot run background jobs or protect warehouse credentials. Automation uses the included owner-operated companion. Authenticated SaaS tenancy, managed backend uptime, real warehouse authorization and production deployment review remain launch requirements.

Graphify was not run: existing manifests, bounded source reads and direct caller inspection were sufficient. No paid integration or optional model runtime is claimed to have run.


## v2.1 review and verification (2026-11-04)

New analytical regressions cover multi-resource risk, missing/negative baselines, exact exception scopes, weighted error budgets, financial reconciliation, forecast cohort completeness/leakage/holdout, contract validation/source identity/maximum export roundtrip, chart gaps/zeros/precision, and schedule summaries. Two independent reviewers inspected integration. Findings about mutable connection provenance and a too-small contract import cap were repaired and covered by regressions. Native forms dispatch by the id attribute because controls named id can shadow the form property; browser save/edit tests verified the fix.

Browser checks covered exact-cohort alerts, 24-hour and 30-day daily forecast training, contract edit/save, dedicated bookmark save and restore, workspace navigation, authenticated companion connection, a disabled dry-run schedule save, dry-run execution and log refresh, and keyboard chart point selection. No external webhook or enabled recurring job was activated. Desktop and 390px responsive layouts were inspected; full assistive-technology and physical-device certification remains outside these checks.

The design detector retained three style warnings: familiar Inter fallback, a square selected-tab underline misclassified as rounded-card accent, and ordinary translucent elevation misclassified as a dark glow. These are not demonstrated functional failures.


## v2.2 integrated verification (2026-11-04)

- JavaScript: 121/121 tests pass, including optional metadata failures/stalls, all quarter ends, commitment invoice tolerance, recent burn resolution/coverage, investigation scope isolation, renewal deadlines, targeted scope recovery and frozen seasonal benchmark leakage guards. Syntax checks cover all 15 JavaScript modules.
- Python: 27/27 tests pass. Real loopback HTTP tests traverse startup imports/assets and reject private/traversal paths. Receiver tests prove its timeout is installed before reading headers, recover a valid signed delivery after a stalled header, and retain replay/bad-MAC rejection. Existing source snapshots and Decimal financial reconciliation pass.
- Companion-hosted browser startup loads 54,216 validated synthetic facts and contract examples. Inspect shows the 2026-11-02 06:00 UTC hourly AWS enterprise CPU observation (96.293%); Return restores broad scope and the original tab. Source reload clears investigation. View all preserves broad filters and focuses its table. Desktop ArrowRight moves selected tab and keyboard focus.
- Recent burn shows AWS growth at 4.87× in its final observed hour while its selected 30-day target remains met. The all-scope forecast comparison reports model MAE 79,257.71 / MAPE 3.2%, last-value 169,596.79 / 7.5%, and weekly baseline 70,042.79 / 2.8%, on the same holdout.
- Renewal rows rank notice deadlines and show AWS overdue 13 days, GCP 8, Azure 3, Equinix due today against the explicit 2026-11-03 demo reference date.
- Mobile at 390×844 has document width 390, a visible full scope summary and all audience choices. Expanded filters expose each dimension. GCP plus AWS/Azure regions yields a targeted recovery which retains GCP and clears incompatible regions; scope persists into Capacity. Default reset restores 30d/all dimensions.
- Independent bounded source reviews challenged security and UI behavior. They identified a stalled optional-metadata startup delay and focus loss after region recovery; both were repaired. No upstream scanners, Graphify runtime, external warehouse credentials, load/penetration certification, or real vendor contract validation was run. Owner-operated scheduling and launch requirements remain in force.

## v2.3 design verification (2026-11-06)

A fresh hierarchy specialist, accessibility reviewer and CSS implementer worked with one commander owning markup/integration. The pass preserves all KPI formulas and values. Existing 121 JavaScript tests and all 15 module syntax checks pass. Companion HTTP asset tests verify the revised entrypoint/style versions without requiring bearer authentication.

Screens were inspected at 1440×1000, 768×1024, 390×844, 320×568 and 568×320. Each had document width equal to viewport width. At 1440px, the KPI strip begins around y305 instead of below the previous alert block; the expanded alert section is about 160px high. Phone Period text is 16px; provider popup stays inside viewport after short-landscape resize. Escape restores the disclosure trigger. Cross-tab filters, desktop ArrowRight focus, exact 96.293% hourly evidence, Return, 30-row chart data and native save-dialog focus/insets were exercised. No browser console errors were observed. Physical touch devices and other browser engines remain untested.

The Impeccable detector ran once on changed UI targets and reported only the existing 3px active-tab underline as a rounded-border heuristic; tabs explicitly have zero border radius, so this is an intentional navigation selection marker. Independent final screenshot review accepted the desktop/mobile result without visual blockers. Review of the fetched Vercel interface guidelines informed contrast, focus, numeric typography and native controls; no automated WCAG certification is claimed. Graphify and upstream security scanners were not run for this bounded visual change.


## v2.4 complete-flow verification (2026-11-06)

- 127 JavaScript tests pass, including null-versus-zero chart behavior, safe matching stroke/legend patterns, table-region labels, null-chart binding and atomic preference persistence/rollback. All 16 JavaScript modules pass syntax checks. The full 27-test Python suite passes, including live loopback public/private assets and signed receiver delivery/replay checks.
- Browser checks covered every audience at 320, 390, 701, 768, 900 and 1024px, plus wide desktop and short landscape. Document width matched viewport width; KPI values fit; medium-width Reset stayed visible. A popup stayed inside 568×320 after rotation.
- Workspace navigation retained selected-control focus. Scenario application retained Apply focus and announced success; Needs review retained checkbox focus. Exact hourly evidence and Return remained intact. Native range inspection, color-independent utilization patterns and keyboard chart-table End scrolling were exercised; headers stayed sticky.
- A disposable loopback delayed API demonstrated disabled Connecting/Loading controls, staged successful connection, malformed replacement URL rejection without losing the previous connection, and discard of an in-flight snapshot after Disconnect. The stale response completed with busy=false and historical 54,216 facts retained. A subsequent successful snapshot ended with 72 intervals, enabled controls, one intact source option and terminal feedback. Fixture counters showed one request per initiated endpoint; no real credential, delivery or schedule was used.
- An opaque-origin iframe with scripts/forms and unavailable storage produced a focused persistence error while retaining My workspace. Saved-view create/remove/undo succeeded in a separate disposable origin; its QA bookmark was removed. A malformed CSV retained the previous source and its long schema error wrapped without dialog overflow. Source restore ended with terminal feedback. Empty mismatched scope showed targeted recovery and rejected empty CSV export with guidance.
- CSV download contained 3,816 facts; independent Decimal totals reconciled revenue USD 151,352.6040 and infrastructure cost USD 8,210.351544. Digest download and view-URL copy succeeded. Shared URLs contained only scope/tab. Maximum 80-character contract ID, 120-character owner, 240-character reference and 1,000-character notes remained readable without page overflow.
- Base plus print CSS was applied to captured rendered content at 794px A4 width. All tables across all audiences, including the nine-column audit and expanded 30/44-row chart evidence, had complete columns inside content bounds, visible overflow and no height clipping. This is print-layout evidence, not native print-preview/PDF pagination or physical-printer certification.
- Fresh specialist review caught lingering loading feedback, repaired and retested. The CSS detector retained only the intentional square-tab selection underline warning; the app/chart detector returned no findings. Physical touch devices, additional browser engines, screen-reader hardware, live warehouses, load/penetration certification and native pagination remain untested. Graphify and upstream scanners were not run for this polish pass.
