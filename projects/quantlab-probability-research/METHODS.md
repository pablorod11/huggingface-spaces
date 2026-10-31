# Methods, provenance and limits

## Forecast question

At the most recently observed close, estimate the next observed close-to-close **log return** in three mutually exclusive categories: below −0.02; from −0.02 through zero; and above zero. A −0.02 log return corresponds to about −1.98% simple return. The categories sum to probability one. A missing date changes the horizon: the model predicts the next supplied observation, not necessarily tomorrow or the next exchange session.

CSV input is `date,close`, using unique, strictly increasing ISO dates and finite positive, consistently adjusted prices. The browser workbench accepts up to 2,500 observations and limits CSV size to 2 MiB. Default strict mode requires at least 1,064 prices. Classic mode accepts 714; that minimum yields only one test outcome and cannot estimate resampling uncertainty. Use longer history and adequate event support for meaningful evaluation. It does not silently sort, impute, fetch prices or validate exchange calendars. Synthetic data is explicitly simulated and is not an historical market sample.

## Browser estimators and chronological evaluation

The browser fits four compact candidates: empirical class frequency, ridge return regression with Gaussian residual probabilities, causal EWMA residual-volatility probabilities sharing the ridge mean, and multinomial logistic classification. These are JavaScript implementations; their presence is not a claim that scikit-learn or a Python runtime executes inside the page.

Features use observed returns, recent momentum, realized volatility and drawdown through the feature date. Strict mode reserves the final 200 labeled feature rows for evaluation. Earlier blocks contain at least 500 training rows, 150 temperature-fitting rows and 150 candidate-selection rows, with one omitted feature row at each of the three boundaries. At the minimum 1,064 closes, 1,003 feature/label rows split into 500 + 1 + 150 + 1 + 150 + 1 + 200. Larger histories expand training. Feature standardization, coefficients, temperatures and candidate choice are frozen before evaluation. Latest forecasts use that same evaluated fit and choice; feature values and EWMA state advance causally using already observed information. Evaluation labels never update their own forecasts.

Classic mode retains the previous expanding procedure: 500 initial training rows, a shared 150-row temperature/selection block, test blocks up to 200, and one-row boundary embargoes. Its latest forecast refits on a separate preceding training/calibration block. Historical scores describe the fold-by-fold procedure, not necessarily the latest model.

The strict reservation is relative to each supplied dataset. It is not secret, tamperproof or permanently untouched by development decisions. Repeated inspection, including reruns with revised settings, can still overfit evaluation. Fresh prospective data is needed after using an evaluation to redesign the method.

Both modes use the fixed six-temperature grid. Strict fits temperatures and chooses the candidate on separate blocks; classic reuses calibration for both. Model selection still has uncertainty in both modes, and evaluation belongs to later labels. Multiclass log loss and Brier scores measure probability quality. Reliability bins show predicted probability versus observed frequency and must be interpreted with sample counts. Repeatedly adjusting a method after inspecting these test scores turns the evaluation into another tuning loop.

The ridge model's Gaussian residual distribution is a simplifying assumption, not evidence that financial tails are normal. Empirical frequencies provide a necessary reference. Logistic probabilities can be miscalibrated under class imbalance or distribution change. Parameter uncertainty is not fully propagated. None of these methods guarantees an economic edge.

## Python benchmark and downloadable project

The static site serves [benchmark.json](benchmark.json), a **precomputed** Python experiment, not an inference service. Inspection of the artifact confirms synthetic regime-switching source data with 900 closes and seed 42; fitted scikit-learn 1.9.1, XGBoost 2.1.4 and LightGBM 4.7.0; three completed Optuna trial values; computed XGBoost SHAP with shape `[1,6,3]`; and MLflow status `FINISHED`. Its `precomputed` flag and execution note explicitly identify offline execution. These are artifact-backed execution claims, not an independent reproduction of the Python experiment in this documentation pass.

That benchmark has 187 outer-test observations. The selected chronological procedure's log loss is approximately 0.8820, with multiclass Brier score approximately 0.5615. These numbers describe this fixed synthetic sample only and do not establish superiority over a benchmark or future profitability. SHAP values explain the uncalibrated tree's raw class margins, not the temperature-calibrated probabilities or causal effects. MLflow metadata describes a completed local run; this static site does not contact an MLflow server.

Browser-selected data does not flow into that benchmark. A stored XGBoost/LightGBM comparison or SHAP explanation must never be described as a fresh fit to the currently selected CSV. Compare candidates on compatible evaluation rows and inspect observation counts when a backend has failed or skipped a fold.

The Python source ZIP permits local use of pandas, NumPy, scikit-learn, XGBoost, LightGBM, SciPy, statsmodels, Optuna, SHAP and lightweight MLflow tracking, with optional PyTorch where available. The packaged Python implementation has its own validation, version pins and documented limits. Its full-history ARIMA/OLS diagnostics are exploratory, separate from outer-test probability rankings. Local request-specific MLflow metadata is temporary; a downloaded metadata file is not a persistent experiment server.

TFT, DeepSurv, PPO, complete rough-volatility calibration, SPDE solvers and a justified quantum algorithm are not represented by the static browser baselines. An optional small neural MLP in the Python project is not a substitute for those named architectures. TensorFlow and Qiskit are omitted because no additional framework or quantum task is needed for the current experiment.

## Mathematical demonstrations

- **Prisoner's dilemma:** the selected payoff matrix has a defect/defect pure Nash equilibrium; cooperation can improve both players' payoffs. Pareto analysis of the displayed pure outcomes does not solve arbitrary repeated games.
- **Matching pennies:** a zero-sum 2×2 example with equal mixed probabilities and zero value. The equilibrium depends on the supplied payoff matrix and does not define a trading strategy.
- **Black–Scholes:** European calls and puts under constant volatility/rate, no dividends and diffusion-market assumptions. These are risk-neutral pricing results, not physical forecasts of stock returns.
- **Kelly:** a fixed-payoff binary bet with fractional sizing and a cap. Its win probability and net payoff odds are premises. Directional stock probability alone cannot justify sizing variable-magnitude asset returns.
- **Return diagnostics:** sample moments describe supplied data. A normality result is not an independence test, and ordinary iid asymptotics may fail under serial dependence or heavy tails.

Additional Python labs cover linear algebra/calculus, Bayesian networks, Cox survival, Markov simulation, fractional Brownian drivers, random matrices, ER graphs and a bounded SLE approximation. They are separate research demonstrations. SLE, free probability and connectivity phase transitions are not established equity-alpha signals here.

## Data, research and reproducibility

Browser CSV reading and baseline computation stay in the page; the app makes no prediction-server upload or remote MLflow call. Public hosting requests still occur for application assets. Downloaded results may contain dates, returns and data summaries; review them before sharing. A public source repository must never contain credentials or private market data.

The original research register is included in the Python source download. It distinguishes inspected primary abstracts/publisher metadata from books awaiting lawful full-text access. No full-book reading is claimed. Equations and specialist extensions need chapter-level source work, numerical checks and empirical validation before use beyond the stated demonstrations.

Chronological splitting reduces a specific kind of leakage; it does not eliminate nonstationarity, dependence, survivorship bias, corporate-action errors, repeated-testing bias or poor calibration. Costs, executable fills, market impact and portfolio allocation are not modeled. Synthetic success verifies chosen simulated premises and software behavior, not investment performance. A hosted static page also cannot establish that local Python dependencies will install on every machine.

Hosting configuration follows the official [Static HTML Spaces guide](https://huggingface.co/docs/hub/spaces-sdks-static) and [Spaces configuration reference](https://huggingface.co/docs/hub/spaces-config-reference), checked 25 October 2026. Claims about particular run results belong to the bundled provenance artifact and executed verification record.

## Browser extensions · 26 October 2026

The browser candidate set now also contains `ewma`, sharing the ridge conditional mean but replacing constant residual variance with a causal exponential filter. Its half-life is fixed at20 observations, with alpha=1-exp(-ln(2)/20). The filter begins from training residual mean square. A forecast at feature row i uses residuals strictly earlier than target y[i]. Once a prior test outcome is observable, it may update the variance for a later prediction; regression coefficients and calibration parameters remain frozen within a block. The audit labels this as online variance updating. Annualized residual volatility multiplies per-observation standard deviation by sqrt(252), an assumption that is unsuitable for irregular/gapped observation intervals. Half-life is not tuned on outer outcomes.

The saved Python benchmark is unchanged and predates this EWMA challenger. Its candidate set and results remain historical. The downloadable Python bundle is the prior separate implementation; these additions execute as JavaScript in this Static Space.

The implied-volatility calculator independently implements bracketed bisection of European, no-dividend Black–Scholes call/put pricing. It checks discounted-strike arbitrage bounds, treats the lower bound as zero volatility, rejects the upper bound (no finite solution), and caps its search at volatility10. Convergence is defined by premium residual <=1e-8*max(1,spot), not by a guarantee of parameter identification. Outputs include bounds, iterations, repriced premium and signed residual. Extreme in/out-of-money prices can poorly identify volatility even with small price residual. Negative rates are supported within numerical range. These are risk-neutral pricing quantities, separate from empirical forecast probabilities.

The distribution explorer uses an independently written compensated compound-Poisson Gaussian-jump model:

`X_T = (mu - sigma^2/2 - lambda*(exp(m+s^2/2)-1))*T + sigma*W_T + sum(J_i)`.

J_i are independent Normal(m,s²); N_T is Poisson(lambda*T). `mu` is annual expected simple-return drift under this scenario, not log-return drift. Mean and variance of log return are reported analytically. The Gaussian comparison matches the mixture's full log-return mean and variance. User-selected scenarios are neither calibrated physical forecasts nor automatically risk-neutral models.

Poisson terms are accumulated until omitted mass is below1e-12, without renormalization. PDF/CDF probabilities use the finite mixture directly, with an approximate normal CDF. The plotting grid combines a global grid with quarter-standard-deviation local component grids; it is clipped at mixture quantiles1e-7 and retainedMass-1e-7. Thus the chart omits roughly2e-7 tail mass without changing the downside probability calculation. The audit reports omitted Poisson mass, finite-grid CDF mass, trapezoidal PDF mass and their difference. A visible warning appears if integration discrepancy exceeds0.005. A density can exceed1; interval probability is its integral or a CDF difference.

Conceptual references: [Quantflow EWMA](https://quantflow.quantmind.com/api/ta/ewma/), [Quantflow option-pricing source](https://github.com/quantmind/quantflow/blob/main/quantflow/options/bs.py), [Quantflow jump diffusion](https://quantflow.quantmind.com/api/sp/jump_diffusion/). No Quantmind source has been copied or vendored, and no Quantflow dependency is installed. Standard formulas are implemented independently and checked against analytical identities and an independent SciPy oracle. No performance improvement or trading edge is claimed.


## Validation panel · 26 October 2026

Reports include both an untuned Laplace-smoothed training-frequency baseline and the temperature-calibrated empirical candidate, scored on exactly the selected procedure’s target rows. `baseline_metrics` stores both aggregates and `predictions.baseline_probabilities` preserves row-level pairing. Fold audits store stage populations, all three event counts, baseline losses, selected losses and split boundaries. Strict mode additionally records frozen fit metadata. None of this reconstructs missing probabilities for the saved historical Python benchmark; its new panel is explicitly unavailable.

A worker computes paired selected-minus-baseline log-loss differences. Negative favors the selected procedure. Moving-block percentile intervals use 400 deterministic resamples at block lengths 5, 20 and 60 (capped/deduplicated for small samples), with 20 as the main displayed block when available. Whole-sample blocks cannot estimate uncertainty and return `percentile95:null`, never a false zero-width precision claim. These intervals condition on the fixed prediction sequence, omit refitting/reselection uncertainty, assume sufficient local stationarity, and have no multiple-comparison/repeated-research adjustment. Sensitivity intervals are not independent confirmations. The interface always warns for fewer than 100 test rows; passing that heuristic threshold does not establish adequacy. Even intervals entirely favoring selection are labeled only lower observed loss requiring prospective validation, not proven alpha.

Stage/class counts below a heuristic 10 events are flagged. This warning does not drop rows or alter model selection and is not a guarantee when absent. Rolling diagnostics use trailing 100-row windows every 20 observations plus the final window; shorter samples get an explicitly labeled partial window. Early/recent summaries require at least 200 test observations and use disjoint first/latest 100-row windows. Log loss, multiclass Brier score, entropy and downside counts are descriptive. No formal feature-drift test, automatic retraining, fallback policy or new model architecture is implemented by these diagnostics.

Validation runs inside the web worker. Protocol and model revision participate in the memory-cache key. Clear forecast data removes diagnostics with the report and invalidates outstanding asynchronous work. Existing privacy and free-hosting behavior is preserved.


## Experiment manifests and inspection history
Each successful browser result export includes a SHA-256 fingerprint of UTF-8 JSON `["quantlab-normalized-prices-v1", dates, closes]`, preserving normalized chronological ISO dates and numeric prices. It identifies model inputs, not original CSV bytes, vendor accuracy, corporate-action adjustment or point-in-time availability. CSV adjustment provenance is explicitly unknown. Source metadata, model revision/settings and split boundaries accompany the fingerprint. Historical Python artifacts have no reconstructed fingerprint because their full input series is unavailable.

The tab records successful result views, including cache hits, with sequence, time, fingerprint, protocol, revision, score and latest model. Only the most recent 25 records are retained; total and omitted counts are exported. It records neither failures nor other tabs or prior sessions. Clear and reload reset it. This is a transparent inspection log, not preregistration, tamper-proof evidence, a complete experiment registry or protection against repeated-research overfitting. Exported reports retain their own snapshots after tab history is cleared.


## Latest-input and class support
Report feature_support records the latest fit's training-only feature minima/maxima, standardized latest feature values and training class counts. Warnings use two descriptive heuristics: any feature outside its observed training range or absolute standardized value above3, and any training class count below10. They do not estimate predictive confidence or formally test drift; absent flags do not certify forecasts. Classic latest refits may include observations previously evaluated in earlier folds. Strict training excludes the reserved evaluation. Probability calculations and model selection are unchanged. Small nonzero percentages display <0.01% and near-one percentages >99.99%; JSON keeps exact numbers. See MODEL-STUDY.md for the frozen challenger evaluations and their rejection.

## Frozen forecast checks
New browser exports contain forward_check schema 1: exact latest probabilities, model revision, anchor date/close, normalized-data SHA-256, practice flag and an untuned empirical baseline. The baseline uses original training class counts with one Laplace count per class. The timestamp records creation of the local record, not independently verified saving. Cached results receive a newly created record when displayed; model probabilities are unchanged.

The separate checker reads at most 4 MiB of UTF-8 JSON, requires an explicitly confirmed next observation, validates a strictly later Gregorian date and finite positive close, and computes log(close_next) minus log(close_anchor). Classification uses the original strict −0.02 and zero boundaries. It reports multiclass Brier score, log loss with 1e-12 floor, and selected minus baseline loss. No fitting, model selection, aggregation, trading result or forecast improvement is implied. A later date alone cannot establish that an intermediate observation was not skipped. Imported metadata and the source of prices remain user assertions.

## Hypothetical trading-cost arithmetic
Let N be planned round trips, F completed round trips, A starting notional per trade and m the assumed simple move in percent. Ideal gain/loss is A*N*m/100; completed gross is A*F*m/100. Missed effect is ideal minus completed gross and can be negative when losses are skipped. Cost percentages are converted into basis points for the pure calculation. Net is completed gross minus A*F*(spreadBps + 2*feeBps + 2*slippageBps + delayBps)/10000.

Each completed long trade assumes both buy and sell filled. Uncompleted attempts assume neither leg fills and no exposure/cost. All charges apply to the same initial notional, including sell-side charges; this is an educational convention, not an exchange fee calculation. No reinvestment, financing, inventory path, market impact, partial fills or endogenous latency/fill prediction is modeled. Delay is a chosen adverse price allowance, not elapsed time. It must not double-count effects already included in slippage. Inputs are bounded (notional <=1e9, <=10000 planned trades, move −100%..100%, each charge 0..100%). Extreme combinations can imply losses exceeding the starting amount; no account solvency model is implied.

HftBacktest and NautilusTrader were assessed as separate local execution-research options; KalshiMarketMaker was assessed as an operational/quotation reference. None is installed or executed by this Space, and no upstream source was copied for this arithmetic. None of these calculations measures forecasting accuracy or establishes trading profitability.

## Cost-covering price change
The cost exercise now reports breakEvenMovePercent=(spreadBps+2*feeBps+2*slippageBps+delayBps)/100 for at least one completed trade. Substitution into the fixed-notional gain/loss equation gives zero net (up to floating-point precision). With no completed trades it reports null and no comparison. This is the completed-trade threshold under chosen assumptions, not a forecast or a threshold for recovering a hypothetical missed opportunity. It is independent of notional and completed count when that count is positive. Values above100% exceed the exercise’s allowed move range and are labeled. Exact values remain in the audit; the display rounds to at most six decimals with a nonzero tiny-value label.

## Strict untuned comparison and leakage audit
Strict mode now includes empirical_raw as a fifth candidate with temperature fixed at1. Selection uses its existing earlier selection block, and frozen latest inference follows that choice. Classic forecasting is unchanged. Promotion followed written development/confirmation gates on72 constructed synthetic runs; no market-accuracy claim follows. See [audit and evidence](LEAK-AUDIT.md). The page blocks native form submission through form-action none to protect inputs when JavaScript is unavailable.

## Numerical comparison correction
Live testing found that temperature(raw,1) can differ from raw probabilities at floating-point precision. Negative differences around5e-16 made the UI incorrectly call identical probabilities better. Validation now treats paired loss differences within1e-12 as numerical equality. A matches flag also requires all probability components within1e-12 and every paired loss difference numerically zero; tiny probabilities with material log-loss differences are not called equivalent. The UI explicitly says the selected method used the same chances as counting when that condition holds. Regression tests reproduce seed71005 and a material rare-probability counterexample. This changes diagnostics and wording, not model forecasts or study scores.
