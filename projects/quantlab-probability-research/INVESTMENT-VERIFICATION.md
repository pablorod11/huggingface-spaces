# Investment explorer verification

## Changes

Added investment.js, investment-ui.js, investment.css, market-data.json, test_investment.cjs,
MARKET-DATA.md and an explicit Python snapshot refresh script; index.html loads the modules
and adds a navigation view. Existing forecasting, validation, caching, next-observation
checking and cost-calculator source files are unchanged. Original downloadable research
archives were hydrated from the pinned upstream revision for the complete source bundle.

Source baseline: Hugging Face Space commit 65c82db2e8bfd1ab251906136da0e0902a1ff3cb.
This document records the local checks before the investment release. That release was subsequently published as commit 6fcb807cedde4dc6bfa7253316a5aba31ffd3632.

## Evidence

- All existing Node assertion files plus test_investment.cjs pass. Investment assertions
  were written and observed failing before the calculation module existed.
- The first browser regression run reproduced three failures: initial ticker incorrectly
  defaulted to CSV; typing during the market-data request discarded the eventual catalog;
  hidden invalid historical dates blocked future-mode form submission. All three were
  repaired, and the regression checks pass.
- Chrome headless real-browser checks: default view; all eight tickers in both modes;
  invalid hidden dates; analytic manual scenario ($10,000, 10% annual expected growth,
  20% volatility, 24 months → $12,100 mean, 21% mean ROI); keyboard chart inspection;
  layer toggles; empty amount invalidation; JSON export; local CSV and weekend effective
  dates; malformed CSV; 390px mobile overflow and responsive chart sizing; reduced motion;
  zero JavaScript page errors; typing during a slow catalog load; preserving an uploaded
  CSV during catalog loading; stale file-read cancellation on ticker switch; clear during
  catalog load; local CSV fallback when the market snapshot returns HTTP 503.
- Snapshot validation: eight USD series, 1,254 observations each, 2021-10-29–2026-10-28;
  positive finite adjusted values, increasing unique dates, no missing/dropped provider bars.
- Existing fail-closed CSP remains: script-src/connect-src self, form-action none.
- Desktop and mobile screenshots inspected. Mobile chart uses a smaller coordinate space
  to keep axis labels readable; date spacing reflects elapsed calendar time.
- Current Vercel Web Interface Guidelines were consulted for the touched controls, focus,
  reduced motion, responsive layout, labels, contrast and native keyboard interactions.

## Limits

Chrome desktop and an emulated 390px viewport were tested; physical touch hardware,
Safari, Firefox and screen-reader behavior were not directly tested. The table and native
range controls provide non-pointer alternatives. Data is a dated, manually refreshed
snapshot, and Yahoo's unofficial endpoint may change or rate-limit. Historical adjustment
can be revised by the provider. Scenario ranges do not capture parameter uncertainty,
regime change, all tail risks or execution costs. User CSVs may have irregular spacing or
unverified adjustments; 252-observation annualization assumes daily data.

Source relationships were inspected directly with rg and bounded source reads; Graphify,
SearXNG and Crawl4AI were not run. Known public source URLs were retrieved directly.
