# Wide model budget method review

Scope: proposal and source review only. No training or new final-test stories read. Definitions, axioms, arithmetic and source hashes are in wide-budget-proof.json; this prose review is not a machine proof of runtime behavior.

VALID arithmetic: width64/context64, batch16 gives1,024 supervised next-character predictions/update.7200 updates give7,372,800;14400 give14,745,600, exactly2x. The normalized training body contains3,332,584 story characters after separator removal, so budget equivalents are2.21234 and4.42467 corpus passes. These are repeated overlapping random-window predictions, not unique epochs or guaranteed coverage.

VALID archived provenance: capacity width64 selected_step=executed_steps=7200 and its raw checkpoint SHA matches selection.json. This makes that selected checkpoint a valid step7200 tensor reference. Use the original context64 capacity initializer with seed1729: the context experiment's canonical128-first initializer produces a different shared initialization. A fresh same-seed run with horizon-independent constantLR0.001 should reproduce the prefix only if all optimizer, sampler and numerical details remain fixed; exact tensor comparison at7200 is the required evidence.

Launch issue: existing patience37 permits stopping before14400. Use patience at least73 (there are72 checks), or disable early stopping, then assert executed14400. Preserve selected and executed steps separately. A selected checkpoint earlier than14400 is legitimate validation selection, not an assertion that training converged.

Optional training CE diagnostics are useful for the previously missing fitting gap. Preselect128 training documents with local generator4700 and windows4701; record hashes/offsets and use no_grad/eval, restoring prior training state afterward. Do not advance either global RNG or training-sampler RNG. A fixed in-sample diagnostic can overfit and does not establish broad training loss. Keep validation3702 unchanged.

Predeclare the plateau heuristic before training: terminal improvement =100*(CE12000−CE14400)/CE12000. A nonnegative result below0.5% is small terminal improvement; a negative result is regression, not plateau; at least0.5% is continued improvement. Report the complete curve and checkpoint selected by validation. This endpoint heuristic is neither a convergence proof nor a statistical test and must not alter the fixed budget.

New-final provenance remains UNVERIFIED until manifested:128 unique normalized stories, disjoint from all832 earlier evaluation hashes,4096 training hashes and existing validation. Freeze both selected models and recorded hashes before first final-story read. Final seed3706, fixed within-story shifted windows, same targets for both arms, paired story-level uncertainty. No final result may set hyperparameters or gate definitions.

Generation: predeclare temperature0.7/top20 for all four prompts×three seeds, fixed length and identical paired seeds, retain all12 outputs per arm. Preset exact quality rubric/thresholds and its tie/failure handling before outputs. CE alone does not prove syntax/coherence improvement. Extra sampling settings are secondary. One initialization/sampler seed supports a claim about this trajectory, not seed-robust improvement, sole capacity limits, or asymptotic convergence.

Launch gate: assert archival and data hashes; identical config/vocabulary/init; deterministic full-prefix match; RNG-neutral diagnostics; full14400 execution; validation-only checkpoint selection; final exclusion counts; frozen models; fixed evaluation and quality rules. Record source SHA and runtime. Verify checkpoint/export/JS identity separately before any release. No source edit or deployment is authorized by this method review.

Metadata update: wide_budget_story_test/manifest.json now has128 unique new hashes and832 unique prior evaluation hashes; checked new hashes disjoint from these,4096 training hashes and128 validation hashes. This validates declared manifest membership only. No story text or content-to-hash matching was read/rechecked; freeze/access order remains an execution check.
