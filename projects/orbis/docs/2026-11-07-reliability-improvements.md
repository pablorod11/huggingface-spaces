# Reliability improvements — November 7, 2026

Source reviewed: public Hugging Face Space `PabloRod11/ledgerline-business-analyst`, revision `f770a6a7ac5b0bcbd2afc84e83d85c81c5611d22`.

The review prioritized reproducible reliability and data-integrity defects while preserving the existing interface, formulas, synthetic data, dependency-free frontend and optional local companion.

## Implemented

- **Bound demo startup.** A stalled CSV request or response body previously left the dashboard loading indefinitely. Both now share a 20-second deadline, abort the network request, and report how to retry. Optional contract metadata retains its separate two-second deadline. Regression tests exercise both stalled phases.
- **Reject incomplete SQLite schemas.** SQLite can interpret an unqualified, double-quoted missing column as a string literal. A missing product dimension could therefore pass validation as the value `product`. Qualifying columns with a table alias forces a missing-column error; existing valid warehouse reads remain supported.
- **Preserve pipeline chronology.** Status now follows normalized event occurrence time. Delayed events cannot overwrite newer status or create superseded failure alerts; successful history never moves backward. Equivalent offset timestamps compare equally. Conflicting events at the same instant use failure, then success, then running priority. Comparison, replay registration and state update share a serialized transaction. Older persisted state recovers chronology from saved pipeline events, skipping unrelated receiver payloads.
- **Reject overflowing digest totals.** Individually finite facts can sum to Infinity or produce NaN. Strict JSON validation rejects such digests before success exports or digest delivery. Existing failed-run logs and alerts still apply. Tests cover infrastructure and legacy retail sources in dry-run and delivery modes with delivery stubbed locally.
- **Make clone setup reproducible.** This machine lacks Git LFS, so its initial clone contained a pointer instead of the demo CSV. The deterministic generator restored all 54,216 facts, producing exactly 11,966,888 bytes with SHA-256 `55706a2c7759c35bc3f6c309aa5bd7e608fdfea94060be38059a1b6956f22801`, identical to the recorded LFS object. README now explains both LFS and generation setup.

## Verification scope

Run `npm test`, `npm run check`, and `python3 -m unittest discover -s tests -p 'test_*.py'`. HTTP tests require permission to bind local loopback sockets. New behavior was exercised with failing regression tests before fixes. The local app was also opened in a browser and each analytical tab checked against the regenerated demo.

Final integrated results: **129 JavaScript tests passed**, **33 Python tests passed**, JavaScript syntax checks passed, and `git diff --check` passed. No skipped tests or Python warnings occurred in the final run. No frontend dependency installation or build step was required.

Independent source reviews checked the analytical modules and integrated reliability changes. Source inspection and focused tests were used; Graphify, SearXNG and Crawl4AI were not run. The public repository was retrieved directly.

The improvements are local and have not been published to the Space. Real PostgreSQL credentials, live semantic endpoints, outbound webhooks and unattended schedules were not exercised or enabled. This is a bounded reliability pass, not proof of production readiness; the existing launch requirements still apply.
