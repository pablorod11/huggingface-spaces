# QuantLab Space implementation plan

User authorized converting the existing prototype and applying relevant named libraries. Build a separate upload-ready Gradio Space; retain original project. No live publication before an owner/repository target is known.

1. Reuse pipeline/math/advanced labs and tests. Bounded engine adds genuine sklearn, XGBoost, LightGBM, optional PyTorch MLP classifiers, temperature calibration, Optuna inner-training search and SHAP tree explanations. Model selection remains before each outer test. Specialist owns engine.py/test_engine.py.
2. pandas validates uploads, SciPy describes tails, statsmodels supplies ARIMA and HAC diagnostics, Matplotlib creates a downloadable histogram. Specialist owns diagnostics.py/test_diagnostics.py.
3. Commander owns app.py, service.py, requirements, config/README, export/privacy behavior. Plotly presents probabilities, reliability and scores. MLflow records request-local experiments for download; no remote tracking.
4. Research specialist owns deployment/library docs with current primary sources and access limits.
5. Install dependencies in work/space-venv only; run full original and added tests, actual Gradio prediction and upload-error flow, desktop/mobile browser inspection where runtime permits. Pin tested direct versions and package source excluding secrets, uploads, caches and virtualenv.

Design: achromatic research ledger, blue-gray ground, near-black controls, one blue data accent; visible source and target units, no fabricated figures. Primary job: run a time-ordered experiment and inspect calibrated probabilities. First screen includes data controls, probability output and diagnostics navigation. Honest empty/loading/error states. No quantum feature absent a defined quantum problem; TensorFlow duplicates optional PyTorch and is omitted. No neural model labeled TFT/DeepSurv/PPO.

Acceptance: runnable Gradio6 entrypoint and Spaces YAML; coherent finite probabilities; chronology audits; CSV rejection before computation; isolated per-request artifacts; no uploaded data in shipped package; optional dependencies clearly reported; exact test evidence and source provenance.
