# Terminator normalization: frozen method and product gate

Ney/Lannes review, frozen before candidate text or scores. Isolated source checkout:work/terminator-experiment/imperial-llm. No UI changes, publication or source edits in this review.

## Design judgment before implementation

The bounded intervention is defensible if the only preprocessing policy change is raw question marks and exclamation marks mapped to periods before the unchanged legacy normalization. Quotes still become spaces. Do not silently alter case, whitespace, vocabulary, story boundaries or membership rules. This tests a specific terminator-normalization policy, not punctuation in general or a complete grammar repair.

Use the same4096 original source training identities and128 validation identities for both arms; pin the cached8MB training and1MB validation source hashes. Use the existing51-character vocabulary and width64/context64 configuration. Each arm starts from identical seed1729 weights and runs7200 optimizer updates at constant learning rate, batch16:7,372,800 supervised predictions per arm. Record executed and selected steps separately. Both select the minimum CE on the same repaired canonical validation windows, seed3802. Selection may change relative to the old experiment because validation changes.

The legacy arm's actual final7200-update state must match every archived capacity-reference state tensor. Compare the final trajectory state, not the newly validation-selected checkpoint. Validation evaluation must not perturb model state, CPU RNG or training sampler state. A replay failure blocks interpreting any policy comparison.

## Test isolation and metric meaning

Freeze selections and checkpoint/source hashes before reading the new128 test story contents. Exclude all960 prior evaluation source identities and4096 training identities using original/raw identity plus legacy canonical hashes. A changed repaired hash does not establish novelty: the same source story remains the same observation after normalization. Check train/validation/test disjointness in source identity and both relevant canonical representations; disclose exact-hash and near-duplicate limitations.

Primary evaluation feeds both models exactly the same repaired test windows and targets, seed3803. Secondary evaluation feeds both models exactly the same legacy test windows and targets. Report each representation separately, with paired per-story differences inside it. Do not compare an absolute repaired CE against an absolute legacy CE as though it were a model improvement, and do not average or combine the two representations into a selection or headline CE. Sampling offsets/character positions may differ between legacy and repaired forms because trimming and transformed lengths differ; identical RNG seeds do not establish aligned cross-representation positions. This limits semantic position attribution but not within-representation model comparisons.

A single seed pair and fixed training-prediction budget support only a bounded comparison under this policy. Same source membership is not identical tokenized text or equal compute. No causal claim that lost terminators alone caused prior malformed grammar is justified before this experiment, and even a positive result would not prove a general grammar remedy.

## Frozen qualitative gate

Primary samples use the four existing ordinary prompts, seeds42/1729/2026,160 new characters, temperature0.7/top20:12 continuations per arm. Keep paired settings and report every output. This matches browser filtering policy; Python/browser RNG and tie handling can differ. Inspect text before aggregate losses where feasible. Reuse the28 frozen syntax pairs only as secondary teacher-forced diagnostics; do not train or select weights on them, and do not label their preference rate general grammar accuracy.

For every continuation record clear malformed words separately from broken grammar, local narrative coherence, and degeneration. Terminal truncation by itself is not an error. Candidate release requires no severe unreadability or degeneration, sustained prompt-related narrative coherence, no paired qualitative regression, and no loss regression on fixed primary windows. Some readable clauses or improved CE cannot outweigh severe failures elsewhere in the same output. Preserve exact excerpts and all failures. This is an unblinded agent screen, not a human preference study or general coherence proof. Failed or mixed evidence means keep live model004 and preserve experimental artifacts.

Only a candidate passing both qualitative and numerical gates proceeds to checkpoint/JSON/training-record hash and Python/JavaScript-logit checks, existing Node numerical/worker tests, then CUA generation/stop/errors/focus/navigation/narrow+desktop verification and accurate model metadata. Preserve DESIGN.md and the prompt-first vanilla static UI. No publication on loss alone; no UI work is needed for this experiment.

## Implementation review status

Pending read-only inspection of prepare_terminator_corpus.py and compare_terminator_policy.py. This document is a method assessment and frozen gate, not evidence that scripts executed or checks passed.

## Dataset preparer source review

Reviewed prepare_terminator_corpus.py read-only. Treatment is exactly raw? and! to periods before the legacy normalization path. Legacy train/validation contents are recovered and matched in original hash order,4096/128 membership retained, source-prefix hashes checked, and prior evaluation union required to contain960 canonical hashes. New test selection excludes both these/training legacy hashes and resolved raw identities. Final test contents are produced by the preparer but are explicitly sealed for training workers; CLI isolation remains to be reviewed.

A metadata-only check of the materialized manifest found zero intersections among train/validation/test under each of source_id, raw_source_sha256, legacy_sha256 and repaired_sha256. No test sentence contents were read for this review. The preparer itself does not yet explicitly assert cross-split repaired-hash disjointness; the current materialized corpus passes that extra check, so this is a hardening observation rather than a blocker on these artifacts. Near duplicates remain unassessed.
