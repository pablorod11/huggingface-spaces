# Width64 extended-budget quality gate

Frozen before the extended-budget candidate outputs are inspected. Ney owns these product criteria; Lannes will review the implementation read-only before launch. This bounded experiment compares the existing width64/context64 7200-step reference against a best-validation checkpoint selected from a 14400-step run. Record executed and selected steps separately. No UI changes are needed unless a candidate clears all release gates.

## Fixed qualitative comparison

Use the same four existing ordinary story prompts, seeds42/1729/2026, and160 new characters:12 outputs per model. Primary sampling is temperature0.7/top20 to represent the browser filtering policy. Python and browser RNG differ; this does not promise byte-identical browser output. Include the7200 reference and14400-run selected candidate; live004 may appear only as a benchmark with different history. Inspect every saved continuation and record per-sample evidence, rather than selecting appealing examples.

Before reading losses where feasible, inspect readability/grammar, local narrative coherence, and degeneration. Count samples containing clear malformed words separately from grammar errors; do not flag fixed-length terminal truncation by itself. Readability requires ordinary words and interpretable grammatical clauses. Coherence requires the continuation to develop the prompt's entities/actions without unrelated fragment drift or contradictory identities. Degeneration includes looping or repeatedly recycled phrases that prevent narrative progress. A few good sentences cannot outweigh severe failures later in the same output.

Candidate release requires no severe unreadability or degeneration in the reviewed set, sustained prompt-related coherence, no paired qualitative regression, and no loss regression on the fixed comparison windows. Report all failures and counts. Lower loss alone cannot establish coherence or authorize publication. Mixed/insufficient results mean retain model004 and preserve the experimental artifacts. This conservative qualitative screen is an unblinded agent review, not a human preference study or general coherence proof.

Preserve the eight already predeclared entity-recall probes unchanged as secondary diagnostics. Score only after checkpoint selection freezes; report every decision and all four counterbalanced-pair results. These probes reuse prior diagnostic material and are not independent evidence. At context64 the distant cue is absent, so do not reinterpret first-character forced-choice accuracy as actual long-distance recall. Do not use probes or sampled text to select a checkpoint or adjust this run.

## Bounded implementation/release verification

Before training: verify identical config/corpus/initialization and7200-step trajectory against the prior reference, fixed optimizer/schedule/batch/window sampler, and explicit14400 budget. Any optional train-CE measurement must preserve training mode, RNG state and sampling-generator state; it must use held-fixed training windows without affecting updates. Hash sources/config/reference artifacts and freeze final-test exclusion/offset/selection rules before test contents are read.

Before opening a newly sealed test: freeze validation selection and checkpoint hashes; verify the exact7200 prefix state and distinguish prefix-final state from its best-validation checkpoint. Compare reference and candidate on identical target windows and report per-story differences, reused-validation limitations, runtime and supervised prediction counts. More updates are an intended budget difference, not an equal-compute comparison.

Only after the model passes the quality and loss gates: verify checkpoint/JSON/training-record identity, SHA-256 and Python/JavaScript logits; run existing numerical and worker-generation Node checks. Then use available CUA browser verification for generation, immediate stop with retained text, invalid prompt/seed focus, navigation, narrow/desktop layout and accurate model metadata. Preserve DESIGN.md tokens and prompt-first layout. Unavailable checks remain unverified. Do not perform a redesign, add dependencies, or deploy on numerical checks alone.

No publication or UI work is performed by this criteria document.
