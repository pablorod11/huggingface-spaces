---
title: QuantLab Probability Research
emoji: 📈
colorFrom: gray
colorTo: blue
sdk: static
app_file: index.html
fullWidth: true
short_description: Browser-local probability research and model validation
license: mit
---

# QuantLab / probability research

Public Space: [PabloRod11/quantlab-probability-research](https://huggingface.co/spaces/PabloRod11/quantlab-probability-research).

Explore next-observed-close equity-return probabilities using synthetic data or your own consistently adjusted `date,close` CSV. The interactive browser workbench fits empirical, ridge, EWMA and multinomial logistic candidates with chronological validation. Default strict mode separates temperature fitting and model selection, then reserves 200 evaluation outcomes. Classic expanding validation remains available for shorter histories. It includes separate mathematical demonstrations for games, Black–Scholes and binary Kelly sizing.

**Synthetic examples do not establish a trading edge.** Reported probabilities refer to log-return categories, not executable trades. See [METHODS.md](METHODS.md) for assumptions, validation and scope.

## Free static hosting

This Space serves HTML and JavaScript; it does not launch a Python compute server. Hugging Face's [official static Spaces documentation](https://huggingface.co/docs/hub/spaces-sdks-static), checked 25 October 2026, says static Spaces are served without compute and do not require a paid plan. The creation page offered Static for the selected account. No paid hardware, external model endpoint or API key is needed for the browser workbench. Platform policies may change.

The root YAML selects `sdk: static` and `app_file: index.html`, following the [official configuration reference](https://huggingface.co/docs/hub/spaces-config-reference). Upload this directory's contents to the repository root. No Gradio SDK version, Python requirements installation or build command is required for this static entry point.

## Local data and source

CSV selection and baseline fitting run in the browser. The application does not upload the selected CSV to a prediction or tracking server. Hosting still involves normal browser requests to obtain the public site and bundled assets. Browser extensions, device access and the hosting platform are outside this application's privacy guarantees. Do not commit private CSVs or credentials to this public repository.

The [Python project ZIP](python-project.zip) is provided for local experiments with the broader library stack. Downloading it does not start a hosted Python service. Its server-side data-processing and temporary-storage rules apply if you run the Gradio version; those are distinct from this browser-only workbench. The Python package also includes the original research register: accessible abstracts and metadata were consulted, but the requested books were not read in full.

The [precomputed Python benchmark](benchmark.json) records an actual 900-close synthetic experiment with seed 42: scikit-learn 1.9.1, XGBoost 2.1.4 and LightGBM 4.7.0 fitted; three Optuna trials; computed tree SHAP; and completed local MLflow metadata. It does not train these libraries on your browser-selected CSV. Check the benchmark's provenance and method status before interpreting its results.

## New browser tools

- Causal EWMA residual-volatility challenger with a fixed20-observation half-life and chronological calibration.
- European Black–Scholes implied-volatility inversion with bounds, convergence and repricing diagnostics.
- Compensated normal-jump distribution PDF/CDF explorer with a same-moment Gaussian comparison and explicit truncation/grid-mass audit.

Run `node test_model.cjs`, `node test_labs.cjs`, and `node test_scenarios.cjs` to reproduce the browser numerical checks. The saved Python benchmark remains unchanged; these additional tools are browser JavaScript, while `python-project.zip` retains the separate Python release.


## Evidence before conviction

The validation panel compares both untuned and calibrated empirical frequency on the same target rows, shows paired block-bootstrap uncertainty and sensitivity, and reports fold populations and low event-support warnings. Rolling loss, Brier score, entropy and event counts describe shifts without triggering trades or retraining. Strict mode requires 1,064 prices; classic CSV mode starts at 714 but that minimum has only one test row and no estimable bootstrap interval. Repeated inspection can still overfit either mode.

Run all browser checks with `for file in test_*.cjs; do node "$file" || exit 1; done`. The separate historical Python ZIP/benchmark are unchanged and do not include these new JavaScript validation features. See METHODS.md for the exact protocol and uncertainty limitations.


Browser JSON exports include normalized-input SHA-256, model/configuration and split metadata, plus the latest 25 successful result views in the current tab (cache hits included). Clear/reload reset this local history. This records inspection, not independent validation or vendor provenance. Run `node test_provenance.cjs` for fingerprint/history checks.


The interface starts with plain-language Price explorer, Number games, What if? and Help. Main results show three chances and a short explanation; exact scores, checking methods and audit reports remain available in optional details. This changes presentation, not the forecasting models or the strength of their evidence.

The Apple-inspired refinement centers the actual outcome chances, consolidates optional controls, and uses an opaque result surface beneath lightweight navigation. See APPLE-REFERENCES.md for the bounded design study.


The latest run also checks whether some outcomes have too few learning examples or recent patterns are unusual. These are warning heuristics, not confidence guarantees. Both newly tested forecast combinations failed promotion, so the forecasting policy remains unchanged. See MODEL-STUDY.md and model-study.zip for synthetic and ECB reference-data evidence. New tests: `node test_model_support.cjs` and `node test_numerical.cjs`.

## Check a frozen guess later
Save a new browser report before the next observation. Under **Check a saved guess**, load that JSON and enter the next recorded date and positive closing price from the same series. Confirm that it is the immediate next observation. The browser scores the saved probabilities without fitting a model. Older reports and the saved Python benchmark do not include this record. Made-up examples remain practice.

Local records are editable: timestamps, prices and next-observation claims are not independently verified. One score does not establish accuracy or profitability.

## Trading-cost learning exercise
Under **Number games**, “Would trading costs change the result?” compares hypothetical gains/losses before costs with a fixed-notional example after assumed missed trades, spread, two-sided fees/slippage and an adverse-delay charge. All inputs are chosen by the user. It does not use forecast probabilities or simulate order-book fills. No third-party execution engine or account connection was added.

The cost exercise also shows the price change needed for each finished trade to cover the entered costs. The default is0.27%; this is a hypothetical cost threshold, not an expected return.

Strict mode now lets unadjusted training counts compete alongside the four existing candidates. A [leakage and overfitting audit](LEAK-AUDIT.md) records the conditional form-submission privacy fix, chronological probes and synthetic-only improvement evidence. [Reproducible evidence](leakage-audit.zip) includes pinned before/current model source.

## Investment explorer

The **Investment explorer** tab adds a searchable catalog of AAPL, MSFT, NVDA, AMZN,
GOOGL, TSLA, SPY and QQQ, an initial USD investment, and two calculation modes:

- **A past investment:** choose dates and inspect historical value, total ROI, dollar
  gain/loss, annualized return and maximum drawdown. Non-trading dates snap inward;
  effective dates are displayed. Adjusted-price ratios approximate dividend-reinvested
  growth, with fractional shares and no costs, taxes or inflation.
- **A future scenario:** choose 1–120 months and estimate annual return/volatility
  from 1, 3 or 5 years of daily prices, or enter your own assumptions. The calculator
  shows mean value/ROI, median value, 10th–90th percentile outcomes and modeled loss
  probability. These are conditional lognormal scenarios, separate from the next-close
  forecast models; they are not evidence of a trading edge.

Both modes have animated SVG charts, pointer/touch inspection, a keyboard-operated point
slider, a table alternative and a JSON export. Reduced motion disables animations.
Inactive settings are disabled, and changing invalid inputs clears stale results.
Other tickers can use a browser-local CSV with `date,adj_close` or `date,close` columns
(maximum 2 MiB and 2,500 observations). Input adjustment and currency cannot be independently
verified from those two columns. Estimation assumes daily observations and needs at least
60 returns; it does not reconstruct missing sessions or account for irregular spacing.

Bundled market history is a dated snapshot through **2026-10-28**, not a live quote feed.
See [MARKET-DATA.md](MARKET-DATA.md) for source URLs, adjustment details and the optional
explicit online refresh command. The browser only reads the same-origin JSON asset;
no finance endpoint, credentials, analytics service or new runtime package is required.

For a scenario with starting amount A, expected annual simple growth r, annual volatility
s and horizon t years, `mean = A × (1+r)^t` and
`median = A × exp((log(1+r) − s²/2)t)`. The 10th/90th outcomes add ±1.2815515655 × s × √t
to the median's exponent. Historical estimates use the sample variance of daily log
returns, annualized by 252, and `r = exp(252 × meanLogReturn + annualVariance/2) − 1`.
The outcome band excludes parameter-estimation uncertainty and assumes constant,
independent normally distributed log returns. Long horizons magnify these assumptions.

Run `node test_investment.cjs` for the numerical/CSV assertions, or the existing full test
loop above for regression checks. To preview locally, serve this directory using
`python3 -m http.server 8765 --bind 127.0.0.1`, open the resulting localhost URL and choose
**Investment explorer**. Hosting remains `sdk: static` with `index.html` as its entry point.

Optional browser regression runner (requires an existing Playwright installation and Google
Chrome): while the local server is running, use
`node scripts/check-investment-browser.cjs`. If Playwright is outside this directory, set
`PLAYWRIGHT_MODULE` to its installed module path; `BASE_URL` defaults to
`http://127.0.0.1:8765`. The runner saves screenshots and a check report under
`browser-artifacts/`. These development tools are not needed by the deployed static app.

## Ticker forecasts and reliability reporting

Price explorer now accepts the same eight public stock/ETF snapshots as Investment explorer.
Choose **Stock or ETF snapshot**, select a ticker and press **Show my guess**. The result
identifies the ticker and final observation date: it concerns the next recorded close after
that snapshot, not a live market forecast. Source adjustment and retrieval metadata remain
in JSON exports and newly saved guesses. CSVs and synthetic examples remain available.
Changing settings invalidates old percentages, reliability summaries and exports immediately.

A visible evaluation panel shows each outcome’s count, its mean predicted probability and
its observed rate on exactly the same check rows. Fewer than ten observed events raises a
plain-language support warning. This threshold is a heuristic; matching aggregate rates
does not establish calibration or individual-forecast accuracy. Legacy saved Python results
without matched validation retain their unavailable state rather than fabricated summaries.

One fixed, variance-matched Student-t(4) EWMA challenger was tested under the approved
chronological gates. It failed both synthetic and market development log-loss gates. Neither
confirmation stage was scored, no additional challenger was searched, and model.js remains
byte-identical to the published selection policy. No accuracy gain or investment edge is
claimed. See [FORECAST-STUDY.md](FORECAST-STUDY.md) and [source/results](forecast-study.zip).

All 18 Node assertion files pass. Additional study checks validate distribution arithmetic,
causality, frozen parameters, unchanged classic outputs, generators, scoring and synchronized
bootstrap behavior. The existing full Node test loop includes market-input and outcome-summary
checks. [FORECAST-VERIFICATION.md](FORECAST-VERIFICATION.md) records browser checks and limits.
