# Imperial story fine-tuning candidate

Continued full-parameter story training from deployed model 003. This is a local candidate; the live Hugging Face Space has not been changed.

## Measured result

Fresh-test cross-entropy: **1.615683 → 1.515439**, a **6.20%** reduction. Loss is in natural-log units per predicted normalized character. Lower is better. **62/64 stories** have lower sampled loss; two regress, with largest increase 0.022554.

Validation CE: 1.610060 → 1.508940. These values use new story-contained windows and are not directly comparable to the original published model 003 evaluation windows.

The selected run used constant LR 0.001, AdamW (weight_decay 0.01), clip 1.0, batch 16, seed 1729 and 2400 additional optimizer steps. The comparison used cosine LR 0.0003→0.00003 with the same initialization, seed and training draws, also 2400 steps. Validation CE was checked every 200 steps; minimum validation CE selected checkpoint and schedule; early stopping patience 3 was configured but neither run stopped early. Step 0 was eligible, retaining baseline weights if training failed to improve validation. Both candidates use all 30,643 parameters; architecture, 51-character vocabulary and 64-character context are unchanged. CPU training/validation runtimes: constant 89.3s, cosine 96.7s on this host.

Training uses the packaged 512 normalized TinyStories stories. Selection uses the packaged 64 validation stories, which already informed model 003. Final evaluation uses 64 fresh complete stories from the same pinned official validation-source prefix, excluding exact normalized matches to every packaged split. Four deterministic 64-character windows per story yield 16,384 character predictions; windows may overlap. Baseline and selected candidate were scored only after selection. No tuning was performed after seeing fresh-test results. Near duplicates were not assessed; the small same-domain test and single seed do not establish generalization to other domains or statistical significance.

## What to inspect

- `candidate/checkpoint.pt`, `candidate/model.json`, `candidate/training.json`: selected weights and browser-compatible record.
- `baseline/`: byte-preserved deployed model 003 artifacts.
- `evaluation.json`: raw experiment record, both validation histories, provenance and numerical parity cases.
- `per_story.csv`: paired fresh-test losses and regressions.
- `samples.json`: identical prompt/seed/temperature generations from both models.
- `verification.json`: executed checks and limitations.
- `source.zip`: full original public source plus the new scripts, tests, fresh test corpus, notices, reproduction instructions and execution evidence.

The samples remain misspelled and often incoherent. Lower next-character CE does not prove better story coherence, mathematical reasoning, instruction following or safety. This experiment does not make the model an assistant.

## Reproduce

Extract `source.zip`, enter `imperial-llm`, and use Python 3.12. The measured runtime is PyTorch 2.2.2 CPU on macOS x86_64. No GPU or API credentials are needed; normalized corpus and fresh test stories are bundled. Use a new output directory each time:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-story.txt
.venv/bin/python -m pytest tests/test_finetune_stories.py -q
.venv/bin/python scripts/finetune_stories.py --output experiments/reproduction-new
.venv/bin/python scripts/prepare_story_release.py --run experiments/reproduction-new --output experiments/browser-preview-new
node experiments/browser-preview-new/test_inference.cjs
node experiments/browser-preview-new/test_generation.cjs
```

The original public `space/` remains model 003, so reproduction starts from the correct baseline. The existing script `train_story_model.py` starts from the older model 002 and is not this experiment's entry point. The new runner has import formatting changes after execution; `evidence/finetune_stories.executed.py` preserves the exact source matching the recorded experiment hash.

The preview is a local compatibility-check copy, not a publication bundle: inherited model 003 page text/model card and the empty learning chart must be updated before publishing. Intermediate training CE was not recorded; the browser record includes measured selected-checkpoint training and validation CE, while validation history is in `selected_run.history`. No curve points are fabricated. Before publication, update model documentation, package matching source and perform final release review.

## Verification limits

Focused tests, numerical parity, worker generation and browser checks are recorded separately in verification.json. The full upstream Python suite is **not green** on the measured legacy runtime: torch.compile does not support Python 3.12 in PyTorch 2.2.2, RMSNorm is unavailable and distributed loopback initialization fails in the sandbox. The broad run was interrupted after failures/stalling; its raw log is included. One working-directory-dependent configuration failure was corrected by rerunning from the project root. This limitation does not turn a partial suite into a full pass.

## Licensing

Project code: MIT. Story corpus: modified normalized TinyStories V2 GPT-4 by Ronen Eldan and Yuanzhi Li, revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64, under CDLA-Sharing-1.0 (https://cdla.dev/sharing-1-0/). Existing corpus notices and manifests are preserved; fresh-test attribution and hashes are in source.zip under `data/fresh_story_test/`.
