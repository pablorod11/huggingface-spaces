# QuantLab research register and implementation roadmap

Research date: 25 October 2026. This is an initial research register, not a claim that the requested books have been read in full. The core objective is a reproducible next-session equity-index return and downside probability experiment. Actual predictive value remains unverified until tested on historical, timestamp-correct data.

## Evidence and access

The Napolean local research wrapper was inspected. Its SearXNG readiness query failed with `Operation not permitted`; host web retrieval was used instead. No packages or services were installed. Nine selected primary URLs were requested directly; one Cambridge chapter request failed. Search results supplied discovery metadata only where stated. Full-text papers and books were not read in this pass. The following summaries are limited to the inspected abstracts or publisher/author descriptions.

1. [Lim et al., Temporal Fusion Transformers for Interpretable Multi-horizon Time Series Forecasting](https://arxiv.org/abs/1912.09363), arXiv v3. The inspected abstract describes recurrent processing, interpretable attention, variable selection and gating for mixed historical, static and known-future covariates. **Application inference:** a later multi-horizon challenger, after correctly separating known future inputs from observed-only variables. The abstract does not establish an equity trading edge.
2. [Chen and Guestrin, XGBoost: A Scalable Tree Boosting System](https://arxiv.org/abs/1603.02754), arXiv v3. The abstract describes sparsity-aware tree boosting and scalable approximate tree learning. **Application inference:** a nonlinear tabular probability challenger, subject to time-ordered tuning and probability calibration. Benchmark success is not evidence of financial predictability.
3. [Schulman et al., Proximal Policy Optimization Algorithms](https://arxiv.org/abs/1707.06347), arXiv v2. The abstract describes environment interaction and surrogate-objective policy updates; its reported tasks include robotics and Atari. **Application inference:** use only after defining an execution environment with realistic fills, costs and inventory constraints. PPO is a policy optimizer, not automatically a calibrated probability estimator.
4. [Katzman et al., DeepSurv](https://arxiv.org/abs/1606.00931), arXiv v3. The abstract describes a neural Cox proportional hazards approach, evaluated on simulated and clinical survival data. **Application inference:** a separate time-to-drawdown/default model would need event definitions, censoring rules and proportional-hazards diagnostics. Its clinical results do not validate a financial application.
5. [Gatheral, Jaisson and Rosenbaum, Volatility is rough](https://arxiv.org/abs/1410.3394), v1. The abstract reports rough log-volatility estimates with a small Hurst exponent and proposes an RFSV model. **Application inference:** investigate realized-volatility forecasting and scenario generation; do not assume an estimated Hurst parameter is universal or that a rough process predicts return direction.
6. [Rough Volatility, SIAM](https://epubs.siam.org/doi/10.1137/1.9781611977783). Publisher contents/excerpts inspected. This is an edited volume by Christian Bayer, Peter K. Friz, Masaaki Fukasawa, Jim Gatheral, Antoine Jacquier and Mathieu Rosenbaum, rather than a sole-authored Bayer book. Its contents explicitly include rough-volatility pricing and simulation material. Full chapter access was not established.
7. [Robert M. Gray, Entropy and Information Theory, author page](https://ee.stanford.edu/~gray/it.html). The author page offers a corrected first-edition PDF with permission from Springer, with corrections described in 2023. Availability was verified; the linked PDF was not read. **Application inference:** use entropy, relative entropy and proper probability scoring to assess uncertainty and forecasts.
8. [Handbook on Systemic Risk, Cambridge](https://www.cambridge.org/core/books/handbook-on-systemic-risk/8EA92559AF6649990E609A10A99E31E9). Publisher page inspected; edited by Jean-Pierre Fouque and Joseph A. Langsam. Full book access was not established. **Application inference:** build network stress scenarios separately from the daily return predictor.
9. [Friz and Victoir, Multidimensional Stochastic Processes as Rough Paths, Cambridge introduction](https://www.cambridge.org/core/books/abs/multidimensional-stochastic-processes-as-rough-paths/introduction/B14F3BEF413319C69E2ECA8A5D5236BC). Search discovery identifies Peter K. Friz and Nicolas B. Victoir and the book's rough-path subject. Direct retrieval failed with a cache miss. No chapter-content claims are made.

## Requested book coverage still outstanding

The following are retained exactly as a user-requested reading queue. Their editions, detailed bibliographic metadata and contents were not verified in this bounded pass. The applicability notes are a proposed research allocation inferred from the supplied titles, not claims about what has been read.

- Giuseppe Da Prato, *Stochastic Partial Differential Equations and Applications*: possible infinite-dimensional state dynamics; establish the exact intended volume before deriving an SPDE model.
- Thomas M. Cover, *Elements of Information Theory*: foundations for entropy, KL divergence and information constraints; verify edition and complete authorship.
- Terry J. Lyons, *Differential Equations Driven by Rough Paths*: pathwise integration and stability; verify the exact title and authorship.
- Peter K. Friz, *Large Deviations and Asymptotic Methods in Finance*: rare-event asymptotics and tail approximations; verify complete authorship and edition.
- Markus K. Brunnermeier, *A Crash Course on Crises: Macro Concepts for Runups, Collapses, and Recoveries*: macro-financial scenario narratives; verify complete authorship and edition.
- Maureen O'Hara, *Market Microstructure Theory*: order-flow and execution assumptions.
- Raja Velu, *Algorithmic Trading and Quantitative Strategies*: trading-system and execution research; verify complete authorship.
- Thierry Roncalli, *Handbook of Financial Risk Management*: risk aggregation, tail risk and validation.
- Ruey S. Tsay, *Multivariate Time Series Analysis*: cross-series dynamics and diagnostics; verify exact title.
- Anatoliy Swishchuk, *Stochastic Modelling of Big Data in Finance*: stochastic market models; verify exact title and edition.
- Robert Kissell, *Algorithmic Trading Methods*: implementation shortfall and execution; verify exact title.
- Chris Kelliher, *Quantitative Finance with Python*: numerical finance implementation; verify exact title and edition.
- Robert J. Adler, *Random Fields and Geometry*: random-field excursions and geometric probability; verify complete authorship.

Before book-specific implementation, obtain lawful access to selected chapters and record edition, chapter, page, equations, assumptions, and a reproduction test. No inaccessible book should be represented as an implementation source.

## Model architecture and acceptance gates

1. **Forecast target:** end-of-session information at session t predicts log return from close t to close t+1; downside means return below a stated threshold. A realized target used for evaluation must never enter its own features. A close-based backtest must acknowledge that trading at the exact observed close is not generally executable; a tradable study needs next-open or delayed execution data.
2. **Baselines:** unconditional event frequency and Gaussian return probabilities first, then regularized linear/logistic approaches and an ARIMA challenger. Report Brier score and log loss against the frequency baseline, calibration bins and sample counts. Fitted variance must use training residuals only. An OLS Gaussian residual CDF is a conditional distribution assumption, not a nonparametric probability estimate.
3. **Validation:** expanding-window or rolling chronological splits; transform and select features using training data only. Set tuning rules before evaluating the final holdout. Resample dependent financial observations in blocks when constructing uncertainty intervals. Distinguish an educational iid CLT demonstration from inference for dependent, heavy-tailed returns. Compare economic performance only after costs and execution assumptions are explicit.
4. **Risk and decision:** Monte Carlo stress and drawdown distributions; fractional Kelly with explicit outcome-payoff assumptions, exposure limits and parameter sensitivity. A two-outcome Kelly formula is not justified by an up/down probability alone for variable-magnitude asset returns. Optimize expected log wealth over a specified return distribution instead.
5. **Advanced challengers:** XGBoost, TFT and nonlinear survival methods require sufficiently large appropriate datasets and installed dependencies. Retain only on demonstrated out-of-sample gains. Keep prediction, anomaly detection, event-time modeling and policy optimization separate.
6. **Research extensions:** add covariance cleaning, graph contagion, rough-volatility scenarios, and rare-event methods as independently tested modules. Price options under a risk-neutral measure separately from estimating real-world return probabilities.

## Full concept map

These are proposed roles, not an assertion that every topic is implemented in the current prototype. Consult the implementation manifest and tests for actual status.

- **Zero-sum games, mixed strategies, Nash equilibrium:** matrix-game demonstrations and adversarial execution scenarios. A zero-sum payoff relation is a model premise; it does not describe all real markets.
- **Pareto efficiency, dominant strategies, prisoner's dilemma:** two-player payoff examples distinguish individual incentives from joint welfare. Nash equilibrium need not be Pareto efficient, and a mixed equilibrium is not automatically the optimal trading allocation.
- **Bayes' theorem and independence:** posterior updating and conditional probability diagnostics. Conditional independence assumptions in a Bayesian network must be stated; correlation alone cannot identify a causal graph.
- **PDF versus CDF:** a density can exceed one; interval probabilities are CDF differences. A continuous variable has zero point probability. These distinctions govern tail forecasts.
- **CLT, OLS, hypothesis testing:** baseline estimation and numerical demonstrations. iid assumptions, effective sample size, heteroskedasticity, serial correlation and multiple comparisons affect inference. A small p-value is not predictive alpha.
- **Dot product, rank, determinant, eigenvalues, SVD:** numerical diagnostics and covariance factors. Solve regression through SVD/pseudoinverse or a stable solver, not by explicitly inverting X-transpose-X. A nonzero determinant does not imply good numerical conditioning.
- **Derivative, gradient, Hessian, chain rule, Taylor series:** objective optimization, sensitivity and local approximations. Verify analytic derivatives against finite differences, restrict Taylor approximations to a checked local region, and inspect Hessian curvature rather than assuming convexity.
- **Lasso, ridge, elastic net:** L1, L2 and mixed regularization; standardize on training data and tune time-chronologically. A penalized coefficient is not causal evidence.
- **Markov chains and Monte Carlo:** regime-transition toy models and uncertainty simulations. Validate row-stochastic transitions; account for finite simulation error. A finite-state Markov regime is an assumption, not proof markets are memoryless.
- **ARIMA, XGBoost, TFT:** competing forecast models, ordered by data and complexity needs. Daily equity mean returns may offer little signal; compare against frequency and volatility-only baselines before adding complexity.
- **Bayesian networks:** scenario-factor dependencies with documented graph structure and conditional distributions; no causal interpretation without identifying assumptions.
- **Cox/DeepSurv:** time to an explicitly defined event with censoring; do not turn ordinary classification labels into fabricated survival data. Validate time-dependent calibration and proportional hazards.
- **PPO:** execution/position-policy research after a realistic environment exists. Benchmark against simple policies; separate training environment fit from historical validation.
- **Isolation forest:** feature-distribution anomalies. An anomaly score is neither a calibrated crash probability nor a reason by itself to trade.
- **Random matrix theory and free probability:** high-dimensional spectral nulls and covariance estimation research. Finite-sample, dependence and asymptotic-freeness assumptions require validation. Spectral patterns alone do not establish tradable alpha.
- **Erdos-Renyi networks and combinatorial phase transitions:** synthetic connectivity/percolation and optimization stress tests. Real counterparty networks require actual exposures and weighted clearing dynamics; a random graph giant component is not a validated financial crisis threshold.
- **Schramm-Loewner evolution:** mathematical demonstration of conformally invariant random curves only, unless a defensible financial mapping and empirical identification are supplied. No established equity-alpha role is asserted here.
- **Black-Scholes:** European-option pricing and sensitivities under stated constant-volatility diffusion assumptions. Its risk-neutral distribution must not be presented as a calibrated physical next-day return forecast.
- **Rough volatility, rough paths, SPDEs, large deviations and random fields:** specialist extensions for volatility, path functionals, high-dimensional dynamics and rare events. Each needs a defined financial estimand, mathematical assumptions and numerical convergence evidence before joining the production forecast.

## Claim discipline

VALID means an explicit result follows within a specified checked mathematical or simulated model. It does not mean market-valid or profitable. INVALID means a demonstrated contradiction. UNVERIFIED covers missing data, unread references, incomplete algorithms, unsupported financial mappings and untested predictive gains. Synthetic experiments validate software behavior and recovery of chosen assumptions; they cannot establish investment performance.
