# Browser extension verification · 26 October 2026

Node checks: test_model.cjs (baseline and EWMA), test_labs.cjs, test_scenarios.cjs; app.js syntax check. Chronology tests cover own-label invariance, future-data invariance, exact variance recurrence and next-observation shock reaction. Pricing tests cover call/put recovery, negative rates, arbitrage bounds, zero-volatility boundary and bracket rejection. Distribution checks cover analytical moments, normal limit, monotone CDF, Poisson truncation, mass integration and narrow separated modes.

Independent verifier checked92 SciPy-priced option inversions: maximum price residual9.55e-7. Mixture CDF errors against SciPy were below7.42e-8 in inspected scenarios. These checks concern numerical implementation, not predictive or investment validity.

A plotting defect was found: a uniform grid missed sharply separated narrow mixture modes. The grid now incorporates local component resolution and retains a finite quantile window. A regression test covers the failure; audit fields and a visible integration warning remain. No upstream source was copied. Graphify was not needed for this small, already mapped codebase.


## Interface refresh — 26 October 2026
Apple-inspired visual system and progressive disclosure. Model, labs and scenario Node suites passed; app.js syntax checked. Browser verified automatic forecast, CSV-only input disclosure, calculator summaries and scenario rendering. Desktop 1280px and mobile 390px inspected; mobile scrollWidth=innerWidth=390; no console errors. Independent design review: ship. Automated copy detector warning on retained research limitations reviewed; no removal of substantive caveats.


## Polish verification — 26 October 2026
All three Node regression suites and app.js syntax check pass. Browser checked settings-change notice, CSV missing-file recovery retaining previous results, disabled input/loading state, rerun result focus, calculator output, and invalid option-premium feedback. Desktop and 390px phone screenshots captured; phone scrollWidth=innerWidth=390. No browser console errors observed. Copy detector retained its existing warning on factual research caveats.


## Data quality and caching — 26 October 2026
Added test_data_quality.cjs, test_cache.cjs and test_app_state.cjs. Tests first failed on the missing normalization/cache behavior; implemented bounded parsing, transparent normalization, retained-outlier warnings, cloned LRU/TTL memory caching and operation invalidation on clear. Existing numerical suites pass. Synthetic CSV browser fixture verified 850 prices, two normalized headers, 1700 trimmed date/price values, BOM removal, two retained large moves, labeled repeat-run cache hit and cleared results/export disable. See SECURITY-REVIEW.md for scope and limitations.


## Validation release — 26 October 2026
Strict chronological fitting, temperature calibration, selection and a final 200-row evaluation are separate; classic numerical regression remains unchanged. Ten Node suites passed: model, labs, scenarios, data quality, cache, app state, validation diagnostics, validation model, worker and historical causality boundaries. The latter checks 2,403 earlier forecasts across three future-data boundaries. Independent mathematical and interface reviews completed; a degenerate one-row bootstrap interval was corrected to “not estimable.”

Browser exercised strict/classic switching, protocol-specific cache reuse, historical benchmark unavailability, insufficient-history recovery and a one-row classic evaluation. Desktop, 768px and 390px layouts inspected; no page overflow at the two narrow widths and no console errors observed. Export serializes the current report including validation; automated browser download capture timed out, so actual download capture was not verified in this pass. Tests cover clear invalidation and removal of hidden derived validation content.

Default synthetic strict example: 200 evaluation observations; selected log loss 0.8224 versus raw frequency 0.8149. The interface correctly reports “Advantage not established.” This is implementation evidence on synthetic data, not demonstrated market forecasting value. Fixed-prediction block intervals omit refitting and research-selection uncertainty; repeated test inspection can still overfit.


## Provenance release — 26 October 2026
Added SHA-256 normalized-input manifests and bounded successful-result inspection history. Provenance tests verify deterministic identity, date/value sensitivity, cloned bounded history and clearing. App-state tests exercise export serialization with validation, manifests and cache-hit history; export is disabled after clear. Pending-digest clear regression prevents stale worker creation. Independent source review found no concrete shipping defect. No market-predictive claim follows from these implementation checks. Browser download-file capture remains unverified; JSON Blob construction and download-handler invocation are now directly tested.


## Beginner interface release — 27 October 2026
Simplified navigation, main result labels and explanations; placed checking controls, detailed evidence, extra charts and technical audits behind native disclosures. Main figures are the three existing outcome probabilities; models and split logic were not changed. The checks link explicitly opens its containing disclosure. Existing export/state regression remains passing. Phone preview at 390px had document width 390px, and all four views were inspected. This is developer usability review, not child user testing. Mechanical copy/layout detector raised two cramped-padding warnings on inherited statistic separators; rendered spacing was inspected.

All eleven existing verification suites passed for this release, including export/state and multi-fold causality. Browser checked the missing-file recovery message, checks-link disclosure opening, and save disable after clearing. Independent source review prompted rounding and growth-parameter wording corrections. No formal accessibility certification or child user study was performed.


## Apple-inspired refinement — 27 October 2026
Replaced accumulated styling overrides with one coherent stylesheet. Centered workspace, compact navigation, consolidated controls, primary probability figures and optional chart representation. Existing element IDs retained with no duplicates. No model or scenario calculation changed.

Added regression coverage for moving to the start of a selected view and revealing nested invalid settings. Browser verified invalid seed -1 with closed settings: both disclosures reopened and seed received focus. Cache repeat, checks-link opening, Help and Number games navigation inspected. Phone width390 matched scrollWidth390. Independent visual/source review inspected desktop and phone captures; stale Help copy was corrected. Browser research read official Apple references; no assets downloaded. No child usability study, Apple certification or comprehensive accessibility certification was performed.

Mechanical detector found a skipped heading, corrected to h2, and two inherited separator-padding warnings. Desktop and mobile probability separators were visually inspected with sufficient spacing.

All eleven regression suites passed. At 768px tablet width, scrollWidth also equaled768px. Reduced motion/transparency and increased-contrast alternatives were reviewed in source; preference emulation was not run.


## Model support and stress testing — 27 October 2026
Two challengers were tested on a written development/confirmation design; neither earned promotion. 144 synthetic fixtures and one primary-source ECB USD/EUR reference slice are recorded in MODEL-STUDY.md. No current-policy probabilities or fitted parameters were changed. Independent complete-report comparison (excluding new support metadata) matched the pinned old model exactly in strict/classic for seeds42/313.

New support tests verify training reference isolation, low-class support, latest-shock flagging and causal invariance. Numerical tests assert finite outputs and normalized probabilities on12 extreme-input protocol runs, plus price-scale invariance to2e-11; observed maximum difference approximately1.2044e-12. Additional future-suffix probes preserved1861 earlier records. App state/export tests cover support clearing and exact exports; tiny nonzero percentage formatting is tested with escaped SVG text. Browser processed the 2500-row public FX sample and displayed the zero-training-tail warning.

Independent review corrected classic reference wording: a latest refit may legitimately use earlier evaluated observations. No numerical or leakage defect was found in bounded probes. Graphify did not run; source was inspected directly. These are software checks and historical experiments, not demonstrated market alpha.

All thirteen verification suites passed (12 static suites plus the historical causal boundary suite). Browser reran the public FX CSV, confirmed <0.01% rather than0.00%, observed the support warning, and recorded no console errors.

## Frozen saved-guess workflow — 27 October 2026
Added independently testable record creation and later-observation scoring. TDD integration first failed for missing forward_check; after integration all 13 static test files passed. Coverage includes immutable probabilities, raw baseline, log/Brier arithmetic, impossible dates, nonpositive and extreme prices, schema validation, explicit next-observation confirmation, no refit, JSON export, old-report recovery and clear during delayed file reads. Browser loaded a synthetic fixture, entered a later price and visibly reported Rise at the original 60.64% chance. This is a software fixture, not a prospective market experiment. Existing model numerical policy is unchanged. Graphify did not run; familiar source was inspected directly.

## Trading-cost exercise — 27 October 2026
Added pure QuantExecution.costs with test-first arithmetic and browser/CommonJS export. Integration test first failed on missing submit handler. All fourteen static test files passed after integration. Core covers exact 100-to-58.4 fixture, signed missed losses, zero fills, zero friction, input bounds, accounting identity, copied inputs and browser export. App integration covers percent-to-bps conversion, invalid completed count, recovery and audit replacement. Independent read-only review found no concrete integration defect. Browser verified the default result, invalid completed count, signed missed-loss explanation and phone layout at measured width390/scrollWidth390. Existing forecast model and worker files are untouched. These are software checks, not economic backtest evidence. Graphify did not run; familiar code was inspected directly.

## Cost comparison refinement — 27 October 2026
All fourteen static test files passed. New test-first checks verify the0.27% default threshold, zero net when substituted into the arithmetic, zero-friction0%, and no-completion null. Integration checks threshold display, removal on error and focus on excess completed count. Independent review ran extra zero/tiny/extreme probes and found no concrete defect. Local browser verified normal threshold, focused count error and zero-completion message. Local preview initially failed to attach; retry succeeded. No model/worker calculation changed. Graphify did not run; source was inspected directly.

## Leakage and strict accuracy challenger — 27 October2026
All fifteen static suites passed. New policy test first failed for missing form-action, then passed after the source fix. New strict candidate test first failed for missing raw candidate, then passed: fixed temperature1 and independently recomputed earlier selection score.72 constructed experiments passed the written development/confirmation gates. New strict report matched the tested challenger exactly and complete classic reports matched prior source for seeds42/61002/71004. Independent post-change causal probes preserved6,778 earlier forecasts over24 suffix mutations;48 strict scaler cells match training-only recomputation. See LEAK-AUDIT.md and leakage-audit.zip.

## Numerical comparison correction
Live testing found that temperature(raw,1) can differ from raw probabilities at floating-point precision. Negative differences around5e-16 made the UI incorrectly call identical probabilities better. Validation now treats paired loss differences within1e-12 as numerical equality. A matches flag also requires all probability components within1e-12 and every paired loss difference numerically zero; tiny probabilities with material log-loss differences are not called equivalent. The UI explicitly says the selected method used the same chances as counting when that condition holds. Regression tests reproduce seed71005 and a material rare-probability counterexample. This changes diagnostics and wording, not model forecasts or study scores.
