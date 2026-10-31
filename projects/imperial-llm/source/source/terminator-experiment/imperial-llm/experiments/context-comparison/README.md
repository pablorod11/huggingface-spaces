# Context64 versus context128

**Longer context did not improve this bounded experiment.** Held-out character cross-entropy increased from **1.243531** at context64 to **1.324917** at context128: **6.54% higher loss**. The long arm improves on only11/128 scored stories; the short arm wins117/128. Both achieve4/8 on the predeclared forced-choice name diagnostic, with0/4 counterbalanced pairs fully correct. All40 candidate continuations fail the qualitative story-quality screen. Neither candidate was published; model004 remains live.

## Configuration and interpretation

Both scratch models have embedding width64,4 heads,2 blocks, the same51-character vocabulary,4096 training stories and128 validation stories. Initial non-position tensors match exactly; the short model uses the first64 learned position rows of the canonical128-context initialization. Context64 has110,387 parameters and context128 has114,483, a difference of4096 learned positional parameters.

The short arm executes7200 steps and the long arm3600, with batch16 and constant LR0.001, AdamW default weight decay0.01 and gradient clip1.0. Both train on **7,372,800 next-character predictions**. Both select their final step by minimum validation loss:1.277821 versus1.348953. They are at the budget boundary; this is not a convergence claim. CPU training/validation times are409.7s and401.7s, with one Torch thread per worker running concurrently; these are not isolated performance benchmarks.

This compares two training configurations at equal prediction budget. It does **not** isolate the causal effect of context length: the long arm has half the optimizer updates, different position embeddings and more attention work. Keep context64 as the experimental reference under this budget. These are scratch-trained character models, not fine-tuned pretrained foundation LLMs. Do not infer that longer context cannot help a larger or better-trained model.

## Paired evaluation

Four seeded windows per story each draw129 contiguous characters. The long input contains128 characters; the short input contains its final64. Both score exactly the same64 shifted targets. Long-model prefix targets are ignored with cross-entropy's -100 mask. Available causal history ranges65..128 versus1..64 across scored targets, and absolute positions reset in the short input. Five executable controls check aligned targets, initialization equality, budget equality, masked loss equivalence and causal future-token invariance.

Validation selects checkpoints with seed3704. Final-test seed3705 is used only after both checkpoint selections, hashes and source/data identity are frozen. The128 new complete test stories exclude4096 training stories and all704 prior evaluation stories by exact normalized-text hashes. Each model scores32,768 target characters; windows can overlap. Near duplicates were not assessed. Validation was reused from earlier experiments. One training seed and same-domain prefix sampling do not establish statistical significance or generalization across seeds.

Live004 scores1.524662 on this same test, but has a different width and training history; it is a diagnostic benchmark only. Earlier reports use different windows/test membership and their absolute losses are not directly comparable.

## Recall and generated text

Eight synthetic probes form four counterbalanced name pairs. Names appear beyond the short model's64-character view and within the long model's128-character view. Scoring compares the two name initials' raw next-character logits. Each model scores4/8 with0fully-correct pairs; identical short suffix logits were asserted. The short model's50% aggregate is structurally expected for these counterbalanced pairs, not an estimate of broad random-chance performance. All scores/margins are retained in entity_recall.json.

Coordinator and a separate agent inspected all60 saved continuations:12 ordinary prompt/seed rows plus8 long-prompt rows, each across two candidates and live004. Criteria and probes were fixed before outputs. The separate reviewer inspected text without reading aggregate losses. This is unblinded qualitative screening, not an independent human preference study. All20 continuations per candidate contain malformed words or broken grammar. Both candidates reproduce none of the8 requested names immediately; each paired name swap yields identical sampled continuations. Forced-choice accuracy and sampled exact recall are distinct measurements. Per-sample flags and excerpts appear in quality_review.json.

A context128 example continues the lost-ball prompt with “said the prooling dog now and family.” Ordinary phrases occasionally appear, but reliable narrative coherence remains unestablished. Retain live004; preserve these artifacts for study. Next, diagnose syntax and learning behavior before increasing context or launching another training search.

## Verification and reproduction

27 focused Python tests passed, with Ruff clean. Both exports pass checksums, three Python/JavaScript logit cases, input bounds, tensor validation and seeded worker generation. Additional generation tests exceed128 history characters and verify context cropping, exact output length, determinism and finite logits. Maximum absolute logit error is0.000002217 for short and0.000002176 for long, below0.0001 tolerance. No UI change, browser release or publication occurred. The broad upstream suite is not claimed green; previously documented Torch2.2.2/Python3.12 host incompatibilities remain.

The fresh multi-agent team split engineering, measurement/provenance and product/code review across three workers, with coordinator integration. Euclidean claim verification appears in claim_verification.json and the source method-review document. The unrelated ECC load-balancing checker was not used. Ponytail guided reuse of the existing trainer; Design Workflow required no redesign for this model-only experiment.

Extract source.zip and enter imperial-llm. It preserves explicit source, original/expanded corpora and license notices, all prior exclusion membership, selected/initial checkpoints and results. TinyStories V2 GPT4 remains pinned to revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64 under CDLA-Sharing-1.0, by Ronen Eldan and Yuanzhi Li. No credentials, environments, Git history or Euclid text are included.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-story.txt
.venv/bin/python -m pytest tests/test_context_experiment.py -q
.venv/bin/python scripts/compare_story_context.py --context 64 --output experiments/context-new
.venv/bin/python scripts/compare_story_context.py --context 128 --output experiments/context-new
.venv/bin/python scripts/compare_story_context.py --evaluate --output experiments/context-new --include-live
.venv/bin/python scripts/evaluate_context_probes.py --checkpoint-dir experiments/context-new --probes data/context_probes.json --output experiments/context-new/entity_recall.json
node experiments/context-new/context_64/test_inference.cjs
node experiments/context-new/context_64/test_generation.cjs
node experiments/context-new/context_128/test_inference.cjs
node experiments/context-new/context_128/test_generation.cjs
```

Reuse these final-test stories only to reproduce this comparison. Later tuning needs a new untouched final test. SHA256SUMS.json covers all packaged deliverables.
