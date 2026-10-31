# Measured evidence

- `verification.json`: integration, recovery, model evaluation and browser checks, with explicit runtime and delivery boundaries.
- `benchmark.json`: actual repeated one-worker/two-worker timing runs, alternating order; raw observations and medians must correspond to the revised fixed-global-batch experiment.
- `local-runtime.txt`: versions used for local observations; not a supported-platform dependency lock.

The revised suite passed **six tests in 60.046 seconds** locally, covering API prediction/promotion/restoration, malformed and corrupted inputs/artifacts, orphan handling, supervisor shutdown, actual API training, and two-worker controlled recovery compared with uninterrupted training.

Current methodology is split version 2: 1,078 training, 359 validation and 360 disjoint test images. Minimum validation loss selects inference weights; final evaluation uses the test partition. Old 80/20 validation-only accuracy and per-rank-batch timing figures do not apply to this model/benchmark revision.

Observed tests use Intel macOS, Python 3.12 and legacy PyTorch 2.2.2 with trusted locally generated artifacts. The supported contract requires Linux/PyTorch ≥2.6; Docker builds and remote CI remain unverified here. A published Static Space executes exported weights in the browser and does not establish hosted Python, distributed training or multi-node execution. The public export's SHA-256 identifies the complete source checkpoint containing the selected inference tensors.

Only completed measurements belong in these files. Benchmark timing and browser acceptance results must be refreshed from the new export; previous observations are not carried forward as new verification.
