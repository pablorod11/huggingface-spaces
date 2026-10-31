# Width64 training-budget extension

Doubling the optimization budget improves character prediction, but the selected candidate still fails the story-quality release screen. Model004 remains live; no candidate was published.

The new held-out cross-entropy is **1.188995**, versus **1.268476** for the matched7200-step reference: **6.27% lower**. The candidate improves sampled loss on122/128 stories. Live004 scores1.517295 on the same windows, a21.64% reduction, but that model has a different width and training history and serves only as a benchmark. Compare scores within this report; earlier reports used different final-test stories and windows.

## Controlled replay

Architecture, initialization, vocabulary,4096-story training corpus,128-story validation set, optimizer, batch sampling and constant LR0.001 remain fixed. Both models have110,387 parameters, width64, context64,4 heads and2 blocks. Training uses batch16, AdamW default weight decay0.01 and gradient clipping1.0.

The run executes14400 updates, predicting14,745,600 training characters versus7,372,800 for the reference. Validation selects **step14000**, with CE1.183765. The exported checkpoint therefore reflects14,336,000 training predictions; the final400 updates were executed but not selected. Final-step validation CE is1.186335. Executed and selected budgets must not be conflated.

The archived checkpoint has no optimizer state, so the run replays from its exact seeded initialization. At raw step7200, every model-state tensor matches the archived reference exactly. Constant LR is independent of the eventual horizon, so this verifies the nested trajectory in this runtime before extension. The run takes1036.4s on CPU with one Torch thread, including replay and validation/training diagnostics. This is not an isolated performance benchmark. Optional optimizer-state saving was not added; another exact continuation would require replay again.

The corpus has3,332,584 actual story characters after removing separators. The executed budget equals4.4247 corpus-pass equivalents, not unique coverage or complete epochs, because windows overlap and stories are sampled with replacement.

## Fitting and selection

A fixed128-story training sample uses index seed4700 and window seed4701. Its CE is logged every200 steps alongside the unchanged validation windows, seed3702. A small exact-trajectory test verifies that diagnostics preserve model updates and global RNG state; the full7200-step equality check provides stronger executed evidence.

At the selected checkpoint, training-sample CE is1.188851 and validation CE1.183765. These sampled losses remain close; they do not isolate capacity, data quality or optimizer sufficiency as a cause of syntax failures. The sample belongs to training and is not an independent evaluation set. Training CE never selects checkpoints.

A predeclared descriptive check compares raw validation loss at12000 and14400 steps:1.198201→1.186335, a0.99% reduction. This exceeds the0.5% threshold labeled continued improvement. The threshold is not a convergence test or significance claim.

## Held-out test and prose quality

Both checkpoints are frozen before the new128-story final test is read. The new stories exclude all832 prior evaluation stories and4096 training stories by exact normalized-text hashes. Four seeded64-character windows per story yield32,768 targets per model, seed3706; windows may overlap. Near duplicates were not assessed. Validation has informed previous experiments, and one seed/nested trajectory cannot establish seed-robust superiority.

The commander and a separate agent read all36 continuations: four predeclared ordinary prompts × three seeds × three models, temperature0.7/top20 and160 new characters. The separate reviewer read text before aggregate losses. This matches the browser's filtering policy; Python and browser RNGs still differ.

The selected candidate reduces samples with clear malformed words from12/12 to8/12. All12 still have broken grammar and fail sustained prompt-related coherence. Fixed-length terminal truncation alone was not counted as a language error. Readable clauses appear, but the dog prompt at seed1729 regresses from the reference opening “a little bird.” to “her mom cat.” The candidate later produces “The didn't were very happy”. All per-sample flags and excerpts are retained in quality_review.json. These are unblinded agent judgments, not a human preference study or validated general coherence metric.

The eight reused name-initial probes score4/8 for both models, with0/4 counterbalanced pairs fully correct. Both models have context64 and cannot see the distant cue, so4/8 is structurally expected for this paired construction. This is a consistency diagnostic, not evidence of improved long-distance recall. It did not select checkpoints or change this run.

The numerical loss gate passes and the qualitative release gate fails. Preserve this experimental checkpoint. Further loss improvement alone is insufficient evidence for publication or another automatic budget increase.

## Verification and reproduction

All30 focused Python tests pass. The exported model passes checksum, three Python/JavaScript logit comparisons, input/tensor checks, deterministic generation, invalid requests and long-history context cropping. Maximum logit error is0.000003225, below0.0001 tolerance. Model/checkpoint/initial digests, frozen selection, source/corpus hashes and executed budgets were checked. No UI change or browser release occurred. The broad upstream suite is not claimed green; the documented Torch2.2.2/Python3.12 compatibility limits remain.

Napoleon coordinated bounded engineering, provenance and review missions. Ponytail guided reuse of the existing trainer/exporter. Euclidean verification separates arithmetic/artifact claims from unsupported quality claims in claim_verification.json. Graphify was unavailable among installed skills/connectors; source inspection and rg supplied navigation. The upstream [Humanizer instructions](https://raw.githubusercontent.com/blader/humanizer/main/SKILL.md) guided the final prose edit. Design Workflow required no UI work for this experiment.

Source.zip includes explicit source files, exact7200 reference and initial weights, selected candidate, prior results, corpus and license notices, test membership and training log. TinyStories V2 GPT4 stays pinned to revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64 under CDLA-Sharing-1.0, by Ronen Eldan and Yuanzhi Li. Credentials, environments and Git history are excluded. Euclid text was not added.

Extract and enter imperial-llm:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-story.txt
.venv/bin/python -m pytest tests/test_wide_budget.py -q
.venv/bin/python scripts/extend_wide_budget.py --train --output experiments/wide-budget-new
.venv/bin/python scripts/extend_wide_budget.py --evaluate --output experiments/wide-budget-new --include-live
.venv/bin/python scripts/evaluate_wide_budget_probes.py --candidate experiments/wide-budget-new --output experiments/wide-budget-new/entity_recall.json
node experiments/wide-budget-new/test_inference.cjs
node experiments/wide-budget-new/test_generation.cjs
```

Use the saved final test only to reproduce this comparison. Any later tuning needs another untouched test. evaluation.json, per_story.csv, samples.json, selection.json, verification.json and SHA256SUMS.json retain the full evidence.
