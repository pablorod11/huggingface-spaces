# Story fine-tuning implementation plan

**Goal:** Improve story continuation from the deployed model 003 with a reproducible local candidate and an honest evaluation.
**Architecture:** Reuse the pure PyTorch Transformer, fixed vocabulary/context, licensed TinyStories training corpus and static browser runtime. Never overwrite the deployed Space or select using test results.
**Tech stack:** Python 3.12, PyTorch 2.2.2 CPU, Node.js numerical/worker checks.
**Spec:** User-approved story continuation recommendation in this chat.

## Constraints and review focus
- Preserve downloaded deployed weights and SHA-256; verify checkpoint/JSON identity.
- Recover whole stories by existing manifest hashes; no train/evaluation overlap.
- Compare constant LR 0.001 against cosine LR 0.0003 to 0.00003; at most 2400 steps each, batch16, seed1729, clip1.0; validate every200 steps, patience3.
- Select minimum validation CE including step0; retain baseline if no improvement.
- Fetch a pinned fresh validation-source prefix and reserve stories disjoint from every packaged split for a one-time final test.
- Invalid/nonfinite metrics fail closed; test is never used for tuning.
- Export selected checkpoint, model JSON, training record and parity cases together; generate identical seeded qualitative prompts.
- No new UI or live publication; browser release readiness must be separately verified before publishing.

## Tasks
- [x] Add one focused test file covering story-boundary windows, schedule endpoints, nonfinite promotion rejection, unchanged baseline rejection, and weighted CE arithmetic; watch failure then implement.
- [x] Add scripts/finetune_stories.py: consume deployed assets and hashed corpus; train and compare two schedules, fixed-window validation selection, early stopping, fresh held-out evaluation, JSON/CSV results and compatible export.
- [x] Run tests, execute bounded training experiment and preserve runtime/output evidence.
- [x] Run Python reload/export identity and JS parity/worker checks on candidate copy; inspect generated samples and state limits.
- [x] Package source, baseline and candidate with reproducible commands, license notices, hashes and report under outputs/.

Execution: inline, already authorized by “proceed”. No git commit because the downloaded archive is not a Git checkout. No architecture or visual changes.

Execution record: constant schedule selected at step2400; fresh test CE6.20% lower,62/64 story improvements. Focused tests and browser checks passed; full upstream suite not green on legacy runtime. No live publication. Final read-only review found no actionable correctness or leakage findings.
