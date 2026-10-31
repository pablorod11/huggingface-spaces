# Imperial LLM

Build a reproducible small language model using the existing pure PyTorch pipeline. Start on CPU; scale only after the data, checkpoint and generation path works.

Source: https://github.com/FareedKhan-dev/train-llm-from-scratch
Baseline: bdd480a518094ca834e05ab32131dc126b522d3d (MIT; license retained).

## Command structure

The user sets priorities. The coordinator integrates work. Six general roles share three live worker slots and run in waves; specialist roles are activated only for bounded tasks.

- Berthier: milestones and acceptance criteria; paired with Davout in the first wave.
- Davout: model and training implementation.
- Soult: evidence and data provenance; paired with Lannes.
- Lannes: independent correctness checks.
- Ney: operator workflow; paired with Massena.
- Massena: environment, reproducibility and delivery.

Each contributor reports evidence, changed files, checks and limitations. No additional orchestration framework is required.

## First milestone

Use existing BPE tokenization, HDF5 data, tiny classic and modern models, checkpoint serialization and text generation. Verify with `python -m pytest tests/test_student_track.py -q`. These generated-data checks establish plumbing, not useful language quality.

The first change makes final evaluation respect `t_eval_iters`, just like periodic evaluation, so CPU smoke runs do not unexpectedly evaluate 400 batches. A regression check records the evaluation counts while exercising real training.

## Local setup

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e . pytest
.venv/bin/python -m pytest tests/test_student_track.py -q
```

For actual story training, follow the upstream laptop track in README.md. Default preparation downloads TinyStories training text plus a separate validation file. For local text, use `scripts/prepare_tiny_data.py --dataset text --input corpus.txt`; both splits need more tokens than the context length. Start with `--preset tiny --arch modern --device cpu --seed 42`.

## Next milestones

1. Select a task and licensed corpus; define a held-out evaluation before training.
2. Train a tiny model and inspect loss and generated samples.
3. Compare classic and modern architecture at the same token budget.
4. Scale only after recording hardware, time, loss and checkpoint identity.

Static review also flagged final-checkpoint resume handling in pretrain_base.py and short-corpus validation in the data loader. These are pending independent follow-up work, outside this first change.

## Verification on this machine

Python 3.12.14, macOS x86_64, PyTorch 2.2.2, CPU. The machine cannot install the declared torch>=2.3 wheel; the isolated environment in ../../work/llm-venv uses a legacy build solely for compatibility testing.

- Unmodified test invocation: 17 passed, 4 failed in 47.08 seconds across student-track, tokenizer and classic-model tests. All four failures stop at torch.amp.GradScaler, unavailable in 2.2.
- Student track with a process-local adapter: 7 passed in 25.86 seconds. This includes classic and modern train/checkpoint/generation, configuration checks and the new final-evaluation regression.
- Diff whitespace check passed.
- Supported PyTorch>=2.3 runtime, CUDA and full post-training suite remain unverified. No useful trained model quality is claimed.

Compatibility check, from this repository directory (the adapter is not part of production source):

```sh
../../work/llm-venv/bin/python -c 'import torch,pytest; torch.set_num_threads(1); torch.amp.GradScaler = lambda device, **kwargs: torch.cuda.amp.GradScaler(**kwargs); raise SystemExit(pytest.main(["tests/test_student_track.py", "-q"]))'
```
