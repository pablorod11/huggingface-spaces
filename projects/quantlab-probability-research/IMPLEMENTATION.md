# Quantmind-inspired extensions · 25 October 2026

Approved scope: add EWMA volatility challenger, bracketed implied volatility, and a normal-jump distribution explorer while keeping the existing public Static Space free and CSV processing local.

1. model.js/test_model.cjs: fixed20-observation half-life, prequential ridge-residual variance, temperature/model selection on calibration only; own labels cannot update own variance. Annualized display assumes252 equal-length observations, with gaps qualified.
2. scenarios.js/test_scenarios.cjs: independently written Black–Scholes bisection with arbitrage bounds; explicit user-specified Merton-style compensated jump diffusion, Gaussian moment match, Poisson truncation mass and finite-grid mass reporting. No scenario calibration or directional edge claim.
3. index.html/app.js/style.css: expose challenger metadata, implied-vol form and dedicated PDF/CDF scenario workbench with accessible input errors and units.
4. Update method/provenance notes; run baseline and extension tests, independent numerical/chronology checks, browser synthetic/CSV/scenario/error flows and responsive inspection; update existing public HF repository after verification.

No Quantmind source is vendored and no upstream dependency is installed. Standard algorithms are implemented independently; upstream documentation motivated scope. Preserve the saved Python benchmark as historical/precomputed, with its original candidate set. Python bundle is a separate prior release unless explicitly updated. No paid compute or service enabled.
