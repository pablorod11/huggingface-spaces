# Verification 2026-10-25

Python 3.12 Gradio6.30 builds and serves locally. Full suite:41 tests pass. Full service smoke verified11 outputs, all sklearn/XGBoost2.1.4/LightGBM backends fitted, three actual Optuna training-only trials, SHAP computed, MLflow FINISHED, and a valid four-file results archive. Local macOS tree models required DYLD_LIBRARY_PATH pointing to scikit-learn’s bundled OpenMP runtime; Linux Gradio project declares libgomp1. Torch is optional and not runtime-tested.

The account’s new Gradio creation is paid-plan gated. User chose a free Static Space, implemented separately. This Python project is downloadable for local execution; its libraries are not executed by the static host.

Independent review checked chronology and export isolation. Browser worker export and missing Brier-key defects in the separate static app were repaired with regression tests before publication. Synthetic benchmarks do not establish predictive edge.
