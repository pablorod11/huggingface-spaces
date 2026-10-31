# Forecast reliability release verification

Base: published commit 6fcb807cedde4dc6bfa7253316a5aba31ffd3632.

## What changed

Price explorer can fit the existing forecast policy to eight dated stock/ETF snapshots.
Market input validation checks schema, unique tickers, USD metadata, adjustment/source,
714–2,500 aligned prices/dates, valid increasing calendar dates, finite positive values,
and a 2 MiB read limit. Files are read from the same-origin public JSON asset. User CSVs
remain browser-local. Synthetic settings and CSV/ticker fields are disabled outside their
active mode.

Input edits and fresh calculations invalidate old percentages, evaluation support and
exports. Existing operation guards cancel late module, CSV, market, digest and worker
results. Exported manifests and new saved-guess records retain ticker/source context;
legacy saved guesses remain scoreable. Evaluation summaries use validated matched rows
and report events, average probabilities and observed fractions. Fewer than ten events
is explicitly a descriptive support heuristic. Legacy Python reports do not fabricate
unavailable summaries. Same-origin CSP and fail-closed form-action remain in place.

## Forecast decision

The fixed Student-t4 challenger failed development. Do not promote. No confirmation
scores or bootstrap confirmation intervals were computed. Production model.js remains
identical to the frozen baseline, SHA-256
b2751c8907a9da4ddc5351715152c1c1f401948aa9f19f83df2f9c4882984c7a.
See FORECAST-STUDY.md and forecast-study.zip for the manifest, tests, inputs and results.

## Checks performed

- All 18 test_*.cjs files pass, including new market-input and same-row outcome-summary
  assertions. New logic and source-record changes were tested red before implementation.
- Market tests reject invalid/duplicate tickers, wrong currency, zero/nonfinite prices,
  invalid/duplicate dates, misaligned arrays, missing metadata, invalid source links,
  failed fetches, malformed JSON and oversized input.
- Source state tests reproduce late market reads followed by clear, fresh ticker fitting,
  and edited inputs invalidating report/export/reliability. Existing delayed CSV, module,
  digest, worker and benchmark guards still pass.
- CUA real-browser checks: all eight ticker forecasts; stale export disabled on selection;
  correct source labels and three outcome rows; sparse-event warnings for SPY/QQQ;
  ticker retained in report, saved guess and manifest; switch back to synthetic; legacy
  Python report without fabricated outcomes; local CSV fit with unverified source label;
  native Enter-key submission; cache-hit labeling; investment future scenario still renders.
- A 390px viewport had document width 390px. Reliability table and warning were visually
  inspected, and the temporary viewport was reset. Default desktop view was inspected.
- Independent integration review found no actionable material defect; independent study
  verification confirmed frozen hashes, paired rows, failed gates and unopened confirmation.
- git diff --check and JavaScript syntax checks pass.

## Limits

Browser checks used the available in-app browser and an emulated narrow viewport, not
physical touch devices or a screen reader. No new Safari/Firefox certification is claimed.
Market snapshots remain historical, not live quotes; the next recorded date is not known
from this data alone. Historical validation and descriptive outcome summaries do not prove
calibration, prospective forecast usefulness, accuracy improvement or profitability.
Source was inspected directly with rg and bounded reads; Graphify/SearXNG/Crawl4AI did not run.
