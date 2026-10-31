# Fixed Student-t4 challenger study

**Decision: do not promote. Keep the production selection policy unchanged.** Both development cohorts failed their prespecified primary log-loss gate. Neither synthetic nor market confirmation was scored.

One fixed candidate was appended to the current strict-mode selection policy: Student-t with 4 degrees of freedom, unchanged ridge conditional mean and causal EWMA20 standard deviation, t scale = sigma / sqrt(2). Existing temperature grid, fitting partitions, purges, candidate-selection rule, and target rows were preserved. Classic mode was tested byte-for-byte at the returned-object level against the pinned baseline. No additional candidate was searched.

## Development results

All differences are expanded policy minus unchanged current policy; negative is better. Each run contains the same 200 target observations for both policies.

| Cohort | Paired runs | Log loss difference | Multiclass Brier difference | Downside Brier difference | Gate |
|---|---:|---:|---:|---:|---|
| Synthetic development | 72 | +0.0000498782 | -0.0005159654 | -0.0000213257 | FAIL |
| Market development pooled | 16 | +0.0008513347 | +0.0004568167 | -0.0001670688 | FAIL |
| Market cutoff N-400 | 8 | +0.0009542709 | +0.0002080773 | +0.0001389146 | FAIL |
| Market cutoff N-200 | 8 | +0.0007483985 | +0.0007055562 | -0.0004730522 | FAIL |

Synthetic mechanisms: built_in_regimes, iid_gaussian, heavy_tail, autocorrelated, volatility_up, volatility_down. The same 12 new fixed development seeds (63001–63012) are paired across mechanisms; they do not create 72 independent market replications. Synthetic generation length and mechanism definitions exactly match the archived study (1,200 prices; volatility-change index 900). Market runs use eight tickers and two cutoffs, each with the latest 1,254 prices.

The largest mechanism mean log-loss degradation was +0.0015554341; the largest ticker mean degradation was +0.0099131920. Both stay below the +0.02 guard, but that cannot override primary gate failure. Requiring each market window to pass was a conservative interpretation frozen before scoring; the pooled market gate also fails, so that interpretation does not change the decision.

## Freeze and reproducibility

- Baseline revision: `6fcb807cedde4dc6bfa7253316a5aba31ffd3632`. `baseline.js` comes from `git show` at that exact revision.
- Research data SHA-256: `65274ad093af61057fe71e70f9aea647d68e756aecb67a2c4ab4507abb2ebbbe`.
- Manifest SHA-256: `3802bed270aec8dc1b0068463e32f573592ae9ebf8af3489d6eb503230547dc4`.
- `manifest.json` froze the baseline, candidate, runner, archived mechanisms, numerical/causal tests and data hashes before any candidate scores were computed. New fixed confirmation seeds 73001–73012 and bootstrap settings were frozen but not evaluated.
- Run `node test-candidate.cjs`, `node test-study.cjs`, then `node study.cjs development` from this directory. Every scoring stage validates frozen hashes. `node study.cjs freeze` refuses to overwrite the existing manifest.
- Detailed paired scores, class counts, mean predictions/observed rates and per-date prediction rows are in `development.json`. `development-summary.log` contains compact summaries.

## Verification

- Tests were written first; the initial run failed with `Cannot find module ./candidate.js` before implementation.
- Independent Simpson integration against the t4 density, reference CDF point, symmetry, normalization, finite-tail asymptotics through z=1e50, and integrated second moment validate the t4 construction and variance scaling.
- Own-label and future-suffix mutations at three evaluation positions preserve the earlier t4 forecasts and causal sigma; fit coefficients, selection choice and temperatures remain frozen. Latest forecast reuses the evaluated fit and temperature.
- Classic return objects equal the baseline. Additional harness tests prove exact equality to all six archived generators, score arithmetic, zero-improvement gate rejection, synchronized bootstrap behavior, deterministic resamples and rejection of mismatched dates.
- Explicit attempts to execute both confirmation stages exited 1 with prerequisite-gate errors before scoring. See `confirmation-guard.log` and `market-confirmation-guard.log`. No confirmation result file exists.
- Bootstrap implementation is present and tested but no market-confirmation intervals were computed. The frozen method uses 2,000 fixed-seed synchronized moving calendar-date blocks (20 primary; 5/60 sensitivity), equal-weight ticker mean loss differences and the empirical one-sided 98.3333rd percentile for each of three comparisons.

## Limits

This is a failed historical development experiment, not evidence of improved forecasting or investment returns. The securities are a selected correlated universe. Public past data are not sealed prospective validation. Synthetic mechanisms are controlled software checks. Fixed-prediction bootstrap would omit refitting and research-selection uncertainty; it was not invoked for confirmation because development failed. This study changed no production files.
