# Sentence-terminator policy experiment

The versioned corpus preserves question/exclamation sentence marks as periods, but the controlled training test does not establish a grammar benefit. The repaired arm lowers loss by0.28% on the predeclared repaired-text test, raises loss by2.00% on the legacy-text test, and loses one preference on the reused sentence-pair diagnostic. Both arms still fail every reviewed prose sample's grammar/coherence screen. Neither model was published; model004 remains unchanged.

## Treatment and controls

The only new normalization rule maps raw `?` and `!` to `.` before the unchanged legacy normalizer. Quotes still become spaces. Vocabulary stays at51 characters; model architecture remains width64/context64,4 heads,2 blocks and110387 parameters.

All4096 training and128 validation stories retain their original source membership and order. Source identities combine official split and SHA256 of the raw complete source segment after outer whitespace trimming. Legacy documents exactly match the archived normalized corpus. Every selected training/validation legacy hash maps to one distinct raw source, so reconstruction has no ambiguous raw choice. Pinned8MB training/1MB validation prefix hashes, vocabulary and paired-file hashes are recorded.

Training preserves2171 question marks and5880 exclamation marks as periods,8051 marks across2877 stories. Retaining formerly stripped terminal characters adds189 characters in total. Validation preserves232 marks and adds6 characters; the new128-story test preserves275 marks and adds11. These counts concern punctuation characters, not syntactic sentence counts. Other normalization stays fixed, including quote loss. Trimming and lengths change, which can alter random training-window offsets; those consequences belong to the tested data policy.

Two arms start from the exact same archived seeded initialization and each execute7200 steps, batch16, constant LR0.001, AdamW default weight decay0.01 and gradient clip1.0. Each predicts7372800 training characters. Both select step7200 using the SAME repaired-validation windows, seed3802. The legacy arm's raw step7200 matches every archived reference state tensor exactly, verifying that changed evaluation windows did not alter its optimization trajectory.

Training/validation runtimes are568.4s for legacy and566.5s for repaired, run concurrently with one Torch thread per process. These timings are not isolated speed benchmarks. This tests normalization at7200 steps, not whether the new model surpasses the earlier14000-step selected model.

## Held-out results

Both selections are frozen before final-story scoring. The128 new source stories exclude4096 training stories and all960 previously evaluated stories using original canonical legacy hashes and raw source identities. A changed repaired-text hash alone never establishes novelty. Train/validation/test sets are also disjoint by raw, legacy and repaired hashes. Semantic near duplicates were not assessed.

Primary comparison: on identical repaired test inputs and targets, legacy-trained CE is1.259521 and repaired-trained CE is1.255961, **0.28% lower**. Repaired has lower sampled loss on68/128 stories. Canonical validation CE is1.269350 versus1.259070, so the numerical gate passes.

Secondary comparison: on identical legacy test inputs and targets, legacy-trained CE is1.265061 and repaired-trained CE is1.290352, **2.00% higher**. Repaired improves47/128 stories on this representation. This is a representation tradeoff, not uniform improvement.

Each representation uses four seeded64-character windows per story,32768 targets/model, seed3803. Compare models within each representation. Absolute losses across text versions should not be compared: length/trim changes can change the selected windows and targets. One training seed and this small aggregate primary gain do not establish statistical significance or seed-robust superiority. Validation was reused from earlier experiments.

## Syntax and generated text

The previously authored28 sentence pairs are reused only as a secondary diagnostic after selection. They never supply gradients or select checkpoints. Legacy prefers21/28 grammatical sentences; repaired prefers20/28. Agreement changes9/16→8/16, while word order stays12/12. The new failure is “I am at home.” versus “I is at home.” There are20 unchanged grammatical preferences,7 unchanged ungrammatical preferences and one regression. These synthetic, repeated-frame preferences are not general grammar accuracy or an independent benchmark; lexical frequency and tense confounds remain.

Coordinator and a separate agent read all24 continuations: four predeclared story prompts × three seeds × two arms, temperature0.7/top20 and160 new characters. The separate reviewer read text before aggregate losses or syntax results. Repaired has clear malformed words in11/12 samples versus12/12 for legacy. Both have broken grammar and fail sustained prompt-related narrative in12/12. Fixed-length terminal truncation alone was not counted. Some openings improve, such as “a ball.” for the dog prompt, but later clauses still fail. All excerpts and flags are in quality_review.json.

The review is unblinded agent screening, not a human preference study. Filtering matches browser policy, while Python/browser RNGs differ. The corpus repair works at the representation level; this experiment does not justify calling it a grammar fix or releasing either checkpoint. Preserve the versioned data and measured tradeoff before choosing a further intervention.

## Verification and reproduction

All37 focused training/data tests and4 reused scorer controls pass. Both exports pass checksum, three Python/JavaScript logit cases, input/tensor checks, seeded generation, invalid requests and long-history cropping. Maximum logit errors are0.000002399 and0.000001997, below0.0001 tolerance. Frozen plans/selections, source/preparer/manifest hashes, exact initialization, selected checkpoint and exported model identity were checked. No UI change or browser release occurred. The broad upstream suite is not claimed green; documented Torch2.2.2/Python3.12 host limitations remain.

Napoleon coordinated dataset, engineering and independent review missions. Direct source inspection and rg supplied navigation; Graphify did not run. Euclidean claim checks are in claim_verification.json. The requested workflow was found locally under the renamed `napolean` skill directory with equivalent instructions. No dependency, hook or host-configuration changes were made.

Source.zip uses workspace-relative layout. It includes source, both selected/initial checkpoints, paired corpora, stable membership/provenance, prior references, tests, logs and syntax diagnostics. It excludes credentials, environments, Git history and cached raw prefixes. TinyStories V2 GPT4 remains pinned to revision f54c09fd23315a6f9c86f9dc80f725de7d8f9c64 under CDLA-Sharing-1.0, by Ronen Eldan and Yuanzhi Li; notices remain in the data manifest. Euclid text was not added.

Extract into a fresh directory and run from its root:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -r work/terminator-experiment/imperial-llm/requirements-story.txt
.venv/bin/python -m pytest work/terminator-experiment/imperial-llm/tests/test_terminator_corpus.py work/terminator-experiment/imperial-llm/tests/test_terminator_policy.py -q
.venv/bin/python work/terminator-experiment/imperial-llm/scripts/compare_terminator_policy.py --arm legacy --output work/terminator-new
.venv/bin/python work/terminator-experiment/imperial-llm/scripts/compare_terminator_policy.py --arm repaired --output work/terminator-new
.venv/bin/python work/terminator-experiment/imperial-llm/scripts/compare_terminator_policy.py --evaluate --output work/terminator-new
.venv/bin/python work/score_terminator_syntax.py --models-root work/terminator-new --output work/terminator-new/syntax_diagnostic
node work/terminator-new/legacy/test_inference.cjs
node work/terminator-new/legacy/test_generation.cjs
node work/terminator-new/repaired/test_inference.cjs
node work/terminator-new/repaired/test_generation.cjs
```

The prepared corpus is sufficient for training reproduction. Regenerating it additionally requires the two pinned raw prefixes and prepare_terminator_corpus.py; source URLs and SHA256 values are in the manifest. Preserve existing output directories. The saved final test is for reproducing this comparison; later tuning needs a newly untouched source set. SHA256SUMS.json covers the deliverables.
