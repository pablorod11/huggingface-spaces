# Context experiment: measurement and design review

Scope: read-only source review of `src/models/transformer.py` and `src/models/attention.py`; supplied design is a proposal, not verified execution. No context-test stories were read. This is a prose Euclidean artifact, not a run of the unrelated ECC capacity checker.

## Definitions and premises

D1. Two scratch models: width64, batch16; short context64/7200 optimizer steps and long context128/3600 steps. Both learn character next-token prediction. Architecture, training corpus, tokenizer, optimizer family, and validation policy otherwise must be fixed and recorded.

D2. A paired evaluation item requires129 characters c[0:129]. Long input x=c[0:128], targets y=c[1:129]. Short input=x[64:128], short targets=y[64:128]. Score long logits[:,64:128] and all short logits against exactly the same64 targets (c[65:129]). A merely128-character record cannot provide128 next-character targets without obtaining the129th character separately.

D3. Primary result is paired held-out next-character negative log likelihood, long minus short; negative means better long. Aggregate within each story first, then equally over stories. Report paired story differences and uncertainty resampled over stories, not characters. Fix window count and offsets before any test access. Perplexity is exp(NLL) using natural logarithms; this is character perplexity.

A1. Causal next-token logits at input index t may depend only on input indices0..t. Reviewed attention uses a lower-triangular mask, including diagonal. Verify causality empirically before training by changing a future token and checking earlier logits in eval mode.

A2. Held-out inference requires model.eval() and no_grad(), identical tokenizer and target IDs, no training on test examples, and checkpoint selection by validation alone.

A3. Token-budget equality counts supervised positions, not unique text, compute, updates, or examples.

## Checked claims

C1 VALID within D1/A3: 16*64*7200 =16*128*3600 =7,372,800 training predictions. Updates differ2x; sequence examples differ2x. Attention's quadratic work is approximately2x greater in the long run at equal predictions, while total runtime ratio remains an empirical measurement. Record actual elapsed time.

C2 VALID within D2/A1: target IDs match exactly. Available causal input lengths are65..128 for long versus1..64 for short across the64 scored positions. Thus this metric is a controlled target comparison, but is not64 full-history tokens versus128 full-history tokens at every prediction. Teacher forcing supplies prior gold characters to both models.

C3 VALID from reviewed source: position embeddings are learned absolute embeddings. Long has64*64=4096 extra trainable parameters and evaluated positions64..127 versus short0..63. Same RNG seed does not guarantee shared blocks initialize identically: the longer embedding allocation advances RNG before block initialization. Copy every identically-shaped non-position parameter explicitly; copy first64 position rows; assert equality, while rebuilding size-dependent buffers. Record hashes and trainable parameter counts.

C4 UNVERIFIED until manifested: new128 test stories must be disjoint from4096 training stories and all704 previously evaluated stories. Prove exclusion with canonical source IDs and normalized content hashes, before checkpoint selection; exact hashes do not rule out near-duplicates. Keep new validation distinct from final test, too. Tokenizer vocabulary may be fixed from training or prior declared vocabulary, never adapted to test. Exclusion is not a proof of semantic independence.

C5 VALID only as a limited interpretation: this estimates the difference between two training configurations under a fixed prediction budget, not a pure causal effect of context length. Optimization steps, position parameters, relative training-position distribution, and compute differ. One seed pair cannot establish seed-robust superiority. Declare scheduler progress in training-prediction fractions; using the same absolute warmup-step count silently changes budget fractions. Draw training windows only within training stories, and avoid padding loss or crossing story boundaries unless explicitly part of both designs.

C6 VALID diagnostic design: `context-probes.json` predeclares8 forced-choice items in4 counterbalanced pairs. Each prompt is105 or107 characters; the entity cue is fully absent from the last64 characters but present in the full prompt. Each pair has an identical visible suffix, swapped correct names, and fixed choice order, so a deterministic short model must choose the same first character for both and averages50% within that pair (including half credit for ties). This structural50% is not a random-chance significance model. These tiny synthetic probes test entity-cue sensitivity, not general coherence or natural story understanding. Do not train/tune/select checkpoints on them; report failures as well as successes.

## Conclusion and launch gate

No fatal contradiction in the supplied design once D2's129-character requirement is met. Before launch assert target identity and future-token invariance, copied initialization equality, exact budget equality, story split disjointness, and fixed validation/checkpoint/aggregation rules. Preserve a test-access log and all seeds/config/checkpoint hashes. Predeclare the primary metric; use probes and generated examples as secondary diagnostics only. A same-long-checkpoint full128-versus-suffix64 ablation can clarify inference sensitivity, but resetting absolute positions remains a confound. Stronger causal attribution would require a position-preserving masked-prefix ablation or matched training/update controls, outside this minimal run.

Vocabulary correction before scoring: replaced unsupported Pip/Kit with Ben/Dan. All prompt, choice, answer, answer-initial, and suffix characters now validate against the exact51-character vocabulary in space/model.json; all8 cue-distance checks and4 suffix-pair equality checks pass. See JSON vocabulary_validation for vocabulary hash and source. No model outputs informed this correction.
