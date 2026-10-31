# Imperial LLM project guidance

Use the existing pure PyTorch classic Transformer and vanilla static Space. Prefer the smallest working change; do not add frameworks, API dependencies, hooks or orchestration services without a concrete need.

## Swarm

When the user requests swarm work, use the six general roles in .codex/agents. Work in waves with at most three live workers alongside the coordinator. Berthier plans, Davout engineers, Ney designs, Soult verifies sources, Lannes reviews and Massena delivers. Pair roles when useful. A general may use a specialist only for a bounded independent task within that same limit. Assign file ownership; sequence shared files. Roles inherit the parent model, permissions and tools.

These project files are reusable configuration, not proof that six agents are running. This chat can dispatch the same role instructions directly. New profile discovery depends on opening and trusting this project in a compatible Codex version.

## Model and UI

- Read the real training/export/inference flow before editing. Preserve a baseline before changing weights.
- Compare candidate and baseline on identical evaluation windows, record executed and selected steps separately, and retain the best validation checkpoint. Validation selection is not an independent test.
- Model JSON, PyTorch checkpoint and training record must describe the same weights. Check SHA-256 and Python/JavaScript logits before enabling generation.
- Read DESIGN.md before changing space/index.html or styles.css. Keep the main task visible in narrow Hugging Face iframes.
- Errors belong next to their field and focus must reach the invalid field. Keep model computation off the main thread, cancellation immediate, and generated text out of innerHTML.

## Verification and delivery

Run node space/test_inference.cjs for numerical/model checks and node space/test_generation.cjs for worker generation. Use the browser to verify generation, stop, invalid prompts, navigation, and narrow/desktop layout. Broad upstream tests require a supported runtime; document this host's PyTorch 2.2.2 limitation.

Package only explicit source files, model artifacts, original corpus and notices. Preserve prior work and never include credentials, environments or .git in downloads. Update the authorized Hugging Face Space only after model and UI checks pass.
