# Leakage audit and one accuracy challenger

Freeze before running the experiment on 27 October2026. Existing production model remains unchanged until all gates pass.

Challenger: add untuned Laplace-smoothed training frequencies as a fifth selection candidate. Temperature is fixed at1 for that candidate; select alongside existing four on the existing strictly earlier selection block. No weighting/tuning search and no evaluation-label feedback into choice. All other fitting parameters and chronology unchanged.

Development: six existing synthetic mechanisms, n1200, seeds61001..61006. Confirmation only if development passes: seeds71001..71006, same mechanisms. These are new RNG streams in familiar constructed mechanisms, not independent market data and not sealed prospective evidence. Equal weight each mechanism. Current-policy and challenger targets must match exactly. Compare mean log loss and multiclass Brier; downside Brier recorded.

Prespecified promotion gate at each stage: cohort-average log-loss change<0, cohort-average Brier change<=0, no mechanism log-loss degradation>0.02. If development fails, do not open confirmation or try a second challenger this turn. If it passes confirmation, still label synthetic evidence and inspect actual policy changes before shipping. The prior ECB slice has already been inspected and cannot be used as fresh confirmation. Repeated research over familiar mechanisms remains a limitation.

Independently audit feature/label/scaling/split/EWMA isolation, uploaded-data egress, storage and asynchronous clear behavior. Correctness defects are fixed regardless of challenger score.
