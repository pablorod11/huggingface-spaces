---
title: Distributed ML Command Center
emoji: 🧠
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
---

# Distributed ML Command Center

A working portfolio demonstration of distributed training, recoverable jobs, model promotion and image inference. The workload classifies real handwritten digit images from scikit-learn's bundled `load_digits` dataset: 1,797 grayscale 8×8 images, ten classes, a stratified 60/20/20 train/validation/test split seeded with 42 and 43, and a small 64→64→10 PyTorch MLP. No dataset download or external inference service is required.

The dashboard shows training history, worker count, recovery status and the active model. Select a held-out sample to see class probabilities, or train a candidate and explicitly promote a completed run. Public containers disable training and promotion; local Compose enables them.

## Start the local dashboard

From this directory, with Docker and Compose available:

```sh
docker compose up --build
```

Open http://localhost:8000. The image builds a one-worker reference checkpoint, so inference works immediately. Use the dashboard to run two-worker training, enable worker failure injection, inspect recovery, and promote the resulting candidate. Training and serving share one CPU host; this demonstrates separate processes and DDP collectives, not a multi-node deployment. `docker compose down` preserves the named volume, including run history and the active-model pointer.

## Run without Docker

Supported dependency contract: Python 3.11–3.13, PyTorch ≥2.6, NumPy <2, scikit-learn and FastAPI. Linux is the reference platform. From this directory:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
python -m torch.distributed.run --nnodes=1 --nproc-per-node=2 --master-addr=127.0.0.1 --master-port=29500 train.py
MODEL_CHECKPOINT=artifacts/model.pt DEMO_READ_ONLY=false python -m uvicorn serve:app --host 127.0.0.1 --port 8000
```

Readiness is available at `/health/ready`, the OpenAPI reference at `/docs`, and digit samples at `/api/samples`. `/predict` accepts `{"pixels":[[64 normalized pixel values]]}`; each pixel is in [0,1]. The placeholder is descriptive, not a literal request. The dashboard sends valid samples automatically.

## Demonstrate recovery

Use a fresh artifact directory for each failure demonstration. The launcher restarts the worker group once; the trainer resumes from the last complete epoch with model and optimizer state. Rank one exits after epoch two only once, tracked by a marker next to the checkpoint.

```sh
python -m torch.distributed.run --nnodes=1 --nproc-per-node=2 --master-addr=127.0.0.1 --master-port=29501 --max-restarts=1 train.py --epochs 12 --checkpoint artifacts/recovery/model.pt --metrics artifacts/recovery/metrics.json --fail-once-rank1-at-epoch 2
```

Inspect `artifacts/recovery/metrics.json` for `training.restart_count` and the epoch history. This tests a controlled worker-process failure on shared local storage. It does not establish host-loss recovery, distributed storage durability, or a production scheduler guarantee. Resume requires the original worker count.

## Measure performance and run tests

```sh
python -m benchmark --epochs 12 --repeats 3 --output artifacts/benchmark.json
python -m unittest -v
docker build -t distributed-ml-foundation:local .
docker run --rm distributed-ml-foundation:local python -m unittest -v
```

The benchmark records raw one-worker and two-worker runs, median wall time, training time, accuracy and speedup. Wall time includes process startup, data loading, evaluation and checkpoint writes. Training time sums each epoch's maximum worker duration. The global batch size is held fixed across worker counts. Inspect the benchmark metadata and raw quality measurements before interpreting a local timing ratio as scale-out efficiency. Two workers may be slower on this small dataset. No benchmark numbers are fabricated or preclaimed.

GitHub Actions builds the supported Linux image and runs integration tests. This workflow assumes this project directory is the repository root. Docker builds and that remote CI have not been executed in the development desktop environment; local verification evidence must distinguish the legacy development runtime from the supported dependency contract.

## Public demo preparation

The Dockerfile serves port 7860, bundles the reference model during its build, and defaults `DEMO_READ_ONLY=true`. The build also stores the actual training metrics and a completed run record, so public charts show measured reference history. Its process runs as UID 1000, matching the documented Docker Spaces convention. The README metadata follows the [Hugging Face Docker Spaces configuration](https://huggingface.co/docs/hub/spaces-sdks-docker). See [hosting instructions](docs/hosting.md) for a reviewable upload procedure. The published Static Space uses browser inference and recorded local evidence; Docker/Python hosting remains a separate, unverified delivery path.

## Scope and operating limits

Implemented: CPU Gloo DDP, reproducible split, epoch checkpoints with optimizer state, atomic checkpoint publication, bounded local training controls, explicit candidate promotion, SHA-256 model identity, persisted run records, inference validation and a browser dashboard. A supervisor restart marks previously running jobs failed because their outcome is unknown.

This is a single-host demonstration, not an enterprise production platform. Before production: authenticated control APIs, tenant isolation, gateway request limits, durable object storage and registry, artifact signatures/provenance, scheduler-backed job ownership, multi-node/GPU tests, telemetry, rollout/rollback, capacity management and platform-specific dependency locking. Run the writable dashboard only on trusted localhost. Public mode disables state-changing controls but does not provide rate limiting, abuse protection or enterprise authentication. Checkpoints must originate from a trusted operator; restricted tensor loading does not prove provenance.

## Verification

See [architecture](docs/architecture.md), [model card](docs/model-card.md), [walkthrough](docs/demo-script.md) and [evidence](evidence/README.md). Earlier 80/20 validation-only metrics and per-rank-batch benchmarks do not apply to the upgraded split-version-2, fixed-global-batch experiment. New observations must identify their model, split and runtime. Supported Linux/PyTorch ≥2.6 and Docker execution require their own passing logs.

## Reproduce the static export

The writable application is supported from this source checkout (editable installation) or the Docker image. A standalone wheel does not currently include the dashboard assets.

```sh
python export_public.py --run-dir /absolute/path/to/completed/run --output /absolute/path/to/static-output
```

The run must include matching completed `status.json`, `checkpoint.pt` and `metrics.json`, with split version 2 and validation-selected tensors. The exporter verifies artifact identity, copies the three public template files, saves measured evidence and JS parity vectors, and generates a fresh source archive including the exporter. `export-manifest.json` hashes the resulting files. The browser predicts using selected weights; the SHA-256 identifies the complete training checkpoint.

Verify the exported JavaScript probabilities against PyTorch using Node.js:

```sh
node public/test_inference.cjs /absolute/path/to/static-output/showcase.json
```

This checks 171 sample, random and boundary vectors at tolerance 1e-6, plus invalid normalized input rejection.
