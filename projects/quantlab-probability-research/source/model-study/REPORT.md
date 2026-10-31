# QuantLab model study

Neither tested forecasting replacement earned promotion. The current forecasting policy remains in place. The software improvement is a training-support diagnostic: it warns when outcomes are scarcely represented in the learning data or when the latest features are unusual relative to the fitted training reference.

## Study design and decision

The initial written plan fixed 12 development seeds and 12 different confirmation seeds for six synthetic mechanisms: built-in regimes, independent Gaussian returns, occasional symmetric heavy-tail jumps, autocorrelated returns, rising volatility and falling volatility. Each series has 1,200 prices and the strict 200-outcome evaluation. This gives 144 constructed fixtures. Seeds reused across mechanisms are paired; these are not 144 independent market replications.

The promotion rule required a nonpositive cohort-average log-loss difference against the existing policy in both stages, with no cohort worse by more than 0.02. This was a development heuristic, not a significance test or an investment criterion. Differences below are challenger minus current; negative favors the challenger.

The first challenger fixed 50% weight on the selected forecast and 50% on raw training frequency. It failed development: mean difference +0.025180. It helped quiet/no-signal cases but diluted the useful response to volatility changes. It was rejected without opening confirmation results for that challenger.

A second development attempt used an online combination of five existing forecasts: raw frequency, calibrated frequency, ridge, softmax and EWMA. Weights started equal, then updated by realized log loss only after each outcome was known. No weight or forgetting-rate search was performed. The second attempt was informed by development evidence; this is disclosed rather than treated as an untouched first hypothesis.

The adaptive combination passed development by a tiny margin (mean −0.000304), then failed confirmation (mean +0.000145). Confirmation cohort differences were:

- Built-in regimes: −0.007968.
- Independent Gaussian returns: −0.001224.
- Heavy-tail jumps: −0.005837.
- Autocorrelated returns: −0.000193.
- Rising volatility: +0.008047.
- Falling volatility: +0.008047.

Full per-seed log loss, multiclass Brier, downside Brier and worst-row loss are retained in the JSON files. Some Brier comparisons disagree with loss comparisons. No test result was used to optimize the weights after confirmation. Both challengers remain research artifacts, not app defaults.

## Primary-source real-data sanity check

Used the latest 2,500 USD-per-EUR reference observations from the European Central Bank's history archive, from 2017-01-18 through 2026-10-26. Data are sorted chronologically; no missing prices are filled and no outliers are deleted. Source selection and filtering are recorded in ecb-source.json with archive and normalized-file hashes. This is one historical slice inspected after the synthetic policies were fixed, not prospective validation across markets.

Strict evaluation covers 2026-01-15 through 2026-10-26, 200 outcomes:

- Current selected policy log loss: 0.689329.
- Raw training frequency: 0.693356.
- Calibrated frequency log loss: 0.692537.
- Rejected online combination: 0.689210.

For the current policy versus raw frequency, the block-20 paired fixed-prediction 95% interval for the loss difference is [−0.008374, −0.000501]. Against calibrated frequency it is [−0.007328, +0.000242], which spans zero. Block lengths 5/20/60 are all retained in ecb-results.json. These intervals omit refitting/research-selection uncertainty and depend on block/stationarity assumptions; the app therefore does not establish an advantage over both comparisons.

The small improvement for the rejected combination on this one slice does not override its failed confirmation gate. There are zero big-fall events in both the 1,936 training labels and the 200 evaluation labels. These data cannot validate big-fall forecasting. The middle/positive evaluation counts are 115/85.

ECB reference rates are published for information; the ECB discourages using them for transactions. They are neither adjusted equity closing prices nor executable fills. No costs, investment returns or trading strategy were tested. Source: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html

## Implemented support checks

For the latest forecast, the app records training-only feature minima/maxima and standardized feature values. It flags a feature outside its training range or with absolute standardized value greater than 3. It separately flags training classes with fewer than 10 observations. These thresholds are descriptive heuristics, not calibrated confidence bounds or a formal drift test. An absent warning does not prove reliability. In classic mode the latest refit's training can legitimately include earlier expanding-test observations; strict mode excludes its reserved evaluation from the training reference.

The forecast probabilities, fitted coefficients, model selection and evaluation metrics remain identical to the pinned model in this study. Source review and regression tests check that the diagnostics do not read later labels into a training reference. No automatic fallback, abstention or trading rule was added. Tiny nonzero chances now display as <0.01% rather than rounding to 0.00%; values just below one display as >99.99%. Exact exported probabilities are unchanged.

## Numerical and causal probes

Both protocols were probed with flat prices, extremely small/large finite positive prices, alternating extremes, monotonic trends and an isolated large shock. Outputs stayed finite and probabilities normalized. Price scaling from 1e-300 through 1e300 changed probabilities by no more than about 1.3e-12 in the tested seeded series. Future suffix changes preserved 1,861 earlier prediction records across three boundaries in the new probes. The earlier multi-fold regression remains separate coverage.

These are bounded software checks, not a proof for every possible numeric input or for market forecasting usefulness. No numerical/leakage defect was found in this pass. Graphify did not run; the small familiar model source was inspected directly.
