---
title: QuantLab Probability Research
emoji: 📊
colorFrom: gray
colorTo: blue
sdk: gradio
sdk_version: 6.30.0
python_version: '3.12'
app_file: app.py
suggested_hardware: cpu-basic
pinned: false
short_description: Calibrated return probabilities and chronological model research
license: mit
---

# QuantLab / probability research

A Hugging Face Gradio Space for next-observed-close return probabilities, chronological model evaluation, tail diagnostics, tree explanations, and assumption-bound mathematics labs. Synthetic data is clearly labeled; no historical investment performance or trading edge is claimed.

## Launch locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Python 3.12 is the deployment target. Open http://localhost:7860. Run `python -m unittest discover -v` for the test suite. On macOS, XGBoost/LightGBM can require OpenMP; the app explicitly reports unavailable backends and still runs its baselines. Linux Spaces installs the system package in `packages.txt`.

## Use

1. Choose the synthetic demo or upload a CSV with `date,close` headers.
2. Select model challengers and optional Optuna/SHAP, then run the chronological experiment.
3. Inspect event probabilities, reliability bins, candidate observation counts, full-history statistical diagnostics and chronological audit.
4. Download the ZIP with JSON report, prediction CSV, Matplotlib histogram and MLflow run metadata.

CSV accepts 850–4,000 rows and up to 2 MiB. Dates must be ISO, unique and ascending; prices finite and positive. Supply consistently adjusted closes. Calendar gaps are reported; the forecast horizon is the next observed row, not an assumed exchange session. Synthetic dates are weekday labels, not an exchange calendar. Uploaded CSVs are processed on the server, so use public/non-sensitive data on a public Space.

The events are log return < −0.02, −0.02 ≤ return ≤ 0, and return > 0. A −0.02 log return equals approximately −1.98% simple return. Probabilities sum to one.

## Model and library scope

- **NumPy/pandas:** causal return/momentum/volatility/drawdown features, bounded CSV ingestion.
- **scikit-learn:** standardized multinomial logistic classification.
- **XGBoost / LightGBM:** genuine multiclass gradient-boosted tree challengers. One CPU thread per fit; no stand-ins under these names.
- **SciPy / statsmodels:** distribution diagnostics, ARIMA(1,0,0) return forecasts, and exploratory OLS with HAC uncertainty. These full-history diagnostics are excluded from outer-test rankings.
- **Plotly / Matplotlib:** interactive probability/calibration/score charts and downloadable static return-distribution figure.
- **Optuna:** three XGBoost trials using only an inner split of the first training window. Calibration and outer test data are excluded from tuning.
- **SHAP:** a fitted tree's latest-observation raw class-margin contributions. They do not explain calibrated probabilities or causal effects.
- **MLflow skinny:** per-request local run metadata. No remote tracking server; exports preserve metrics and parameters, not persistent experiment history.
- **Optional PyTorch:** small CPU MLP classifier. Install `requirements-torch.txt` to enable it. It is not a TFT, DeepSurv or PPO implementation. Its execution is separately qualified in verification notes.

TensorFlow would duplicate the chosen optional neural backend. Qiskit has no justified quantum task in this probability system and is omitted. See [LIBRARIES.md](LIBRARIES.md) for official sources and roles.

Empirical and ridge baselines always run. The Space uses 500 initial training rows, 150 calibration rows, a one-row embargo at each boundary, and 200-row outer test blocks. Train-only standardization and calibration-only temperature/model selection preserve time order. Failed or class-degenerate optional folds can produce different candidate observation counts; compare coverage before interpreting rankings. The original NumPy OLS/lasso/elastic-net implementations remain in `pipeline.py`; the Space's challenger set is separately documented.

The latest forecast excludes its unobserved dummy label from fitting. Calibration is reused for temperature and model selection, so its scores are optimistic; the outer test is separate. Repeated inspection/tuning on the same outer history compromises that separation.

## Mathematical laboratories and remaining work

The UI exposes two-player game examples, European Black–Scholes pricing, and binary fractional Kelly. The included `math_lab.py` and `advanced.py` additionally contain independently scoped probability, linear algebra/calculus, Markov, Bayesian-network, Cox-survival, isolation-forest, fractional-Brownian-driver, SLE, ER-network and random-matrix examples. These modules are not all integrated forecasting features.

TFT, DeepSurv, PPO, full rough-volatility calibration, SPDEs, combinatorial-optimization phase transitions and quantum algorithms remain unimplemented. Fractional Brownian sampling is not a complete rough-volatility model. ER connectivity is not optimization hardness. No financial alpha is inferred from SLE or finite random-matrix behavior. [RESEARCH.md](RESEARCH.md) tracks accessible primary-paper abstracts and all requested books; full books were not read.

## Data, retention and resources

No live prices, paid APIs, broker credentials, remote MLflow endpoint or automatic publishing are configured. Each run has an independent random temporary directory. Old run exports are cleaned on the next run after one hour; Gradio also clears its cache. Restarted or rebuilt Spaces may lose all local files. Download needed exports. Uploaded data is not included in the deployment bundle.

Queue concurrency is one, with up to eight waiting requests; model fits are bounded. Optional imports or fits that fail are reported in the audit. A public Space is a server application, not a local privacy boundary.

## Deploy

Upload the contents of this directory to a Gradio Space, with `app.py` and this README at the repository root. The tested Gradio version in `requirements.txt` and `sdk_version` must agree. See [DEPLOYMENT.md](DEPLOYMENT.md) for complete instructions. No account, repository or paid hardware is provisioned by this project.

[Hugging Face Spaces configuration](https://huggingface.co/docs/hub/spaces-config-reference) defines the README metadata. [Gradio Spaces documentation](https://huggingface.co/docs/hub/spaces-sdks-gradio) describes this deployment format.
