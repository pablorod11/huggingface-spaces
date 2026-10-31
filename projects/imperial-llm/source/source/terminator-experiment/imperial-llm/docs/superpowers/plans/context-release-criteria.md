# Context experiment: bounded product release criteria

Role: Ney (product criteria), with a later Lannes review of implementation. Sources: the experiment checkout's AGENTS.md and DESIGN.md, the existing story-capacity quality review, and the user-invoked design-workflow skill.

## Scope decision

No UI changes are needed to run the width64/context64 versus width64/context128 experiment. Keep the current Space and model004 unchanged while comparing the two arms on the same corpus and equal training-token budgets. A longer context is an experimental hypothesis, not an established quality improvement. The previous wider-model inspection found broken grammar or malformed words in every one of its 12 wider samples and did not establish reliable coherence; lower loss alone cannot override that release failure.

Preserve the scientific-notebook design, vanilla static Space, existing prompt-first layout, worker inference, immediate stop, and safe text rendering. Do not add controls, visualizations, frameworks, or redesign work to this experiment. Only a separately justified candidate release needs accurate model metadata and explanatory copy updates.

## Qualitative candidate gate

Before considering deployment, inspect all saved continuations from a predeclared paired prompt/seed set, using identical sampling settings and output limits for both arms. Include ordinary story prompts and entity-recall prompts with entity names or facts positioned beyond the shorter context. Freeze prompts and review criteria before reading candidate outputs; keep the sealed test independent of validation checkpoint selection.

Record per-sample judgments and examples for these concrete properties:

- Readability: ordinary words and complete grammatical clauses; flag malformed words, broken syntax, or uninterpretable text.
- Local coherence: continuation relates to the prompt, keeps the principal entity and its action consistent, and does not drift into unrelated fragments.
- Entity recall: when the relevant name/fact is in the longer context, reproduce or use it correctly without inventing a conflicting identity or attribute. Record exact recall separately from broader story quality.
- Degeneration: flag looping phrases, pathological repetition, or abrupt fragment sequences.

A candidate is ineligible if any reviewed output has severe unreadability or degeneration, if it regresses on paired ordinary-story quality, or if context128 does not improve the predeclared long-distance recall cases. Publish counts and all saved outputs, including failures. This is a conservative product screening rule for the bounded sample, not proof of general coherence or a statistically validated preference result. If evidence is mixed or insufficient, preserve the experimental artifact and retain model004; do not enlarge this run into an open-ended search.

## Bounded verification before any future deployment

1. Confirm corpus identity, disjoint train/validation/sealed-test windows, equal training-token accounting, width64 in both arms, and declared context lengths. Record executed steps and selected steps separately; compare loss on identical evaluation windows and preserve the best validation checkpoint. Report compute/time differences without presenting equal tokens as equal compute.
2. Verify that checkpoint, exported model JSON, and training record refer to the same selected weights, including SHA-256 provenance. Confirm Python/JavaScript logits and execute the existing numerical/model and worker-generation checks (`node space/test_inference.cjs` and `node space/test_generation.cjs`) against the release candidate. Unavailable checks remain unverified; disclose the host's PyTorch 2.2.2 limitation where relevant.
3. After the qualitative gate passes, load the exact candidate in the existing local UI. Through the available CUA browser, check generation, stop retaining partial text and restoring controls, invalid prompt/seed error and focus behavior, section/hash navigation, and narrow/desktop layouts. Inspect screenshots for visible prompt/Generate/output, readable metadata, and horizontal overflow. Check generation and cancellation with the larger context specifically.
4. Verify displayed context, parameter count, training/selected-step record, checkpoint digest, and limitations match the candidate artifacts. Reuse existing design tokens and behavior. If only model data/copy changes, inspect the affected workbench and experiment section; no unrelated visual audit or redesign is required.
5. Keep the baseline artifacts available, package only explicit source/model/corpus/notice files, and update the authorized Space only after all required checks pass. Record which exact artifact was deployed and the observed result.

Experiment-level verification does not constitute deployment approval or a browser/UI pass. No deployment is performed by this criteria document.
