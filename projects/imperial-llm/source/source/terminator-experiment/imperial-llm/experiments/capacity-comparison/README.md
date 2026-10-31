# Story model capacity comparison

Doubling embedding width from32 to64 improved held-out character prediction. Reliable story coherence remains unestablished: all12 inspected wide-model continuations still contain malformed words or broken grammar. Model004 remains live; neither experimental model was published.

On the same newly reserved test, character cross-entropy is **1.497890** for matched width32 and **1.239930** for width64: **17.22% lower**. Live004 scores1.495041; the previous longer-trained width32 scores1.354681, giving wide-model reductions of17.06% and8.47% respectively. Wide loss is lower on128/128 stories versus both matched32 and live004, and126/128 versus the previous continued model. These descriptive comparisons use one seed and do not establish statistical significance.

Both matched arms start from seeded random initialization, use4096 whole TinyStories training stories, the same128-story validation set,64-character context,51-character vocabulary,2 blocks and4 heads. They execute7200 steps of batch16, constant LR0.001, AdamW default weight decay and gradient clipping1.0: **7,372,800 predicted training characters each**. Width32 has30,643 parameters; width64 has110,387. Equal tokens do not imply equal computation. CPU training/validation runtimes were377.5s and538.4s, running concurrently with one Torch thread per worker on this host; these are not isolated hardware benchmarks.

Validation alone selects step7000 for width32 (CE1.501091) and step7200 for width64 (CE1.258924). The wider checkpoint is at the budget boundary and may benefit from further training; this run does not establish convergence. The preexisting live and continued models have different training histories and are diagnostic benchmarks, not matched capacity controls. These experiments compare training capacity, not adapter fine-tuning of a pretrained foundation model.

## Test and quality review

Both selections, initial/checkpoint hashes and source/corpus hashes are frozen before final-test access. The128 fresh final stories exclude all576 prior evaluation stories and4096 training stories by exact normalized-text hash. Four seeded64-character windows per story yield32,768 predictions per model; windows may overlap. Validation was reused from earlier experiments; near duplicates were not assessed. Compare scores within this report, because earlier reports used different final-test stories/windows.

All48 stored continuations were read:4 fixed prompts ×3 seeds ×4 models, temperature0.7 and160 new characters. Inspection is unblinded, qualitative and by one agent, not an independent human study. Wider-model text has some recognizable phrases but remains unsuitable for dependable storytelling. For example, the dog prompt at seed1729 starts “a little bird.” and continues “They rellied to go help. They plaster, the said she this top that day.” Loss improvement alone does not meet a story-quality release criterion.

The numerical loss gate passes; publication stays disabled. A useful next controlled experiment is longer context while keeping width64, corpus and explicit training budget fixed, with fresh test membership and predeclared entity-recall prompts. This is a hypothesis to test, not proof that context is the remaining bottleneck.

## Verification and reproduction

22 focused Python tests passed. Both exports pass model SHA checks, three Python/JavaScript logit cases, input/tensor validation and seeded worker generation checks. Maximum absolute logit error: width32=0.00000544, width64=0.00000364, below0.0001 tolerance. No UI change or browser release was made. The broad upstream suite is not claimed green: this host's Torch2.2.2/Python3.12 lacks support required by unrelated modern-model tests.

Extract source.zip and enter imperial-llm. It includes explicit source files, original and expanded licensed corpora, all prior evaluation membership, exact initial/selected checkpoints, live004, prior benchmark and this experiment. No authentication files, environments or Git history are included. Training data derives from TinyStories V2 GPT4 at pinned revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64, under CDLA-Sharing-1.0; dataset manifests retain source and modification notices. Euclid's Elements was not added to the story corpus.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-story.txt
.venv/bin/python scripts/compare_model_capacity.py --width 32 --output experiments/capacity-new
.venv/bin/python scripts/compare_model_capacity.py --width 64 --output experiments/capacity-new
.venv/bin/python scripts/compare_model_capacity.py --evaluate --output experiments/capacity-new
node experiments/capacity-new/width_32/test_inference.cjs
node experiments/capacity-new/width_32/test_generation.cjs
node experiments/capacity-new/width_64/test_inference.cjs
node experiments/capacity-new/width_64/test_generation.cjs
```

The saved test is for reproducing this comparison. Any later tuning needs another untouched final test. See evaluation.json for complete metrics/selection histories, per_story.csv for all story losses, samples.json for every continuation, quality_review.json for release reasoning, verification.json and SHA256SUMS.json for evidence and integrity.
