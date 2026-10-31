# Controlled story-corpus expansion

User-approved continuation: expand licensed stories while keeping architecture fixed and checking generation, not loss alone.

- [x] Prepare4096 unique normalized training stories, retaining the prior512 and excluding all192 prior evaluation stories;128 new validation and128 new final-test stories; preserve all earlier data.
- [x] Test normalization/deduplication/partial-story removal and rejection when expansion loses to the matched control; watch failures before implementation.
- [x] Run both512-story control and4096-story expansion from model004, constant LR0.001, batch16, context64, seed1729, exactly2400 steps each. Retain minimum validation CE; disable early stopping so token budgets match.
- [x] Freeze checkpoint selection before reading/scoring the new final test; compare baseline, control and expansion on identical windows. Do not tune after test evaluation.
- [x] Export both candidate arms, check JSON/checkpoint identity, Python/JS parity and worker generation; repeat the four fixed prompts and three generation seeds.
- [x] Save reproducible source, data notices, hashes, paired loss/generation results, limitations and promotion decision. Keep live004 unless both objective and qualitative evidence justify a release.

No architecture/UI changes. One training seed. Exact deduplication only; no significance claims. The original loss test is not rescored. No API credentials or environments are included in source artifacts.

Result:expanded testCE1.447142 vs control1.454350 and baseline1.502947. Loss gate passes; quality review does not establish coherence improvement. No publication.
