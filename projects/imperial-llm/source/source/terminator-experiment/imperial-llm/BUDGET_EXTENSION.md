# Longer-budget story experiment

Training longer improves sampled character prediction substantially. It still does not produce reliably coherent stories in the inspected examples. **Model 004 remains live; no new candidate was published.**

## Result

On a newly reserved final test, model 004 CE is **1.505603**, the 2,400-step expanded-corpus reference is **1.445310**, and the longer-budget selected candidate is **1.368748** nats per normalized character.

This is **9.09% lower loss than model 004** and **5.30% lower than the 2,400-step reference**. Candidate sampled loss is lower on 127/128 stories versus model 004 and 124/128 versus reference. These measurements are descriptive; a single training seed and same-domain prefix-selected evaluation do not establish statistical significance.

The run executed **7200 steps** and selected **step 7,000** by minimum validation CE. Selected validation CE is **1.366743**, compared with **1.438950** for the reference. Step 7,200 was slightly worse on validation and was not exported as the candidate. Both were scored only after selection. New test stories/windows differ from earlier experiments, so compare models within this report rather than comparing absolute scores across reports.

## What changed

Only the maximum optimization budget changed: 2,400→7,200 steps. Both use the same 4,096 training stories (3,340,775 normalized characters), 128-story validation set, 30,643-parameter architecture, 64-character context, 51-character vocabulary, batch 16, seed 1729, constant LR 0.001, AdamW defaults and gradient clip 1.0. The longer replay uses 7,372,800 predicted training characters; the reference used 2,457,600. Best-validation checkpoint retention remains enabled, with early stopping disabled through the fixed budget.

The previous checkpoint did not preserve optimizer state. Instead of resetting AdamW at step 2,400, this experiment replays from the exact model 004 initialization. It verifies every state tensor at raw step 2,400 against the archived reference before continuing. The check passed, providing a controlled trajectory comparison within the measured runtime. CPU training/validation runtime was385.0s; this includes replay of the first 2,400 steps. No architecture, inference code, vocabulary or licensed training-data change was made.

## Evaluation and quality

The new final test contains 128 unique whole stories, excluding all 448 earlier evaluation stories and 4,096 training stories. Four seeded 64-character windows per story yield 32,768 character predictions per model; windows may overlap. The current validation set is reused for checkpoint selection; the new final test is not used for gradients, checkpoint selection or later tuning. Exact normalized duplicates are excluded; near duplicates were not assessed.

All 36 stored outputs were inspected unblinded by one agent: four predeclared prompts × three fixed seeds × three models; temperature 0.7, 160 new characters. This is not a human preference study, validated coherence score or independent blind review. All 12 longer-budget continuations still contain malformed words or broken grammar and often drift from the prompt. For example, the dog prompt at seed 1729 starts “a little bird.” but continues “They he was she because the toys sturprised to her friend.” See samples.json for all results, including favorable and unfavorable examples.

The numerical loss gate passed. Reliable coherence improvement remains unestablished, so retain live 004. A useful next controlled experiment is model capacity at fixed corpus/context, rather than assuming another budget increase alone will solve narrative quality. This is a hypothesis to test; this experiment does not prove capacity is the bottleneck.

## Reproduce

Extract source.zip and enter imperial-llm. The archive preserves the exact model 004 initialization, archived 2,400-step reference, expanded corpus, all prior data, new final-test membership, source, notices and results. No credentials, virtual environment or Git history are included.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements-story.txt
.venv/bin/python -m pytest tests/test_extended_budget.py tests/test_expanded_corpus.py tests/test_finetune_stories.py -q
.venv/bin/python scripts/compare_story_corpora.py --extend-budget --output experiments/budget-reproduction-new
node experiments/budget-reproduction-new/extended_7200/test_inference.cjs
node experiments/budget-reproduction-new/extended_7200/test_generation.cjs
```

Use a new output directory. The measured runtime is Python 3.12/PyTorch 2.2.2 CPU. Normalized data is bundled, so no download is needed. Reproduction repeats already observed results; it is not a new independent test. The original corpus-experiment source is preserved separately under evidence/*corpus.executed.py. Later changes add extended-budget support and an exact-prefix verification hook.

Read verification.json for executed checks and limitations. Focused checks do not establish a green upstream suite: prior compile/RMSNorm/distributed-runtime failures on this legacy host remain documented. Numerical and worker checks passed for both reference and candidate; no new browser UI release was prepared.

Data: modified normalized TinyStories V2 GPT-4 by Ronen Eldan and Yuanzhi Li, revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64; CDLA-Sharing-1.0, https://cdla.dev/sharing-1-0/ . Source URLs, normalization, prefix and membership hashes are preserved in manifests. Code remains MIT licensed.
