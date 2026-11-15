# Cyber Command usability implementation plan

**Goal:** Make the existing workbench understandable to business owners, analysts and portfolio reviewers.

**Approved direction:** Explain the product, offer a guided sample, use task-first labels and a review → evidence → decision → report path. Preserve the visual identity, browser-local data model, security validation, no-cost runtime and no-Docker deployment.

**Architecture:** Existing vanilla JavaScript and native HTML controls. Keep root and static HTML entrypoints equivalent apart from asset paths. No schema or detection-engine changes.

## Tasks and ownership

- [x] Forms specialist: both HTML entrypoints only. Short local-storage explanation with expandable technical detail; functional hat labels; fix scope and review-note label ordering; explain review decisions. Preserve IDs, validation and authorization.
- [x] Workflow specialist: static/app.js only. Plain overview, sample launch that opens the existing form without auto-consent or saving, collapsible workspace tools, actionable assessment guidance and task-first tab names. Show confirmation fields only when required. Preserve unsaved draft and conflict handling.
- [x] Commander: shared CSS, updated first-use documentation, browser regression selectors and a meaningful guided sample test. Verify zero-finding exercises, keyboard use, small screens, storage failures and saved-decision/report workflow.
- [x] Fresh reviewer: check integrated changes for misleading claims, lost controls, inaccessible hidden errors and regressions. Fix material findings and rerun affected checks.

## Acceptance evidence

Run existing Node detection/storage tests, JavaScript syntax checks and browser UI/engagement suites with the installed browser runtime. Verify the sample path visually in desktop and narrow viewports and save screenshots. Publishing requires the final tested source, an explicit allowlist and live verification; do not confuse local changes with the hosted release.

## Rulings

- User explicitly approved implementation and requested new agents; continue without another plan approval.
- The current project is a source export without Git metadata. Keep edits in its existing task-owned directory and preserve a before copy; no speculative worktree.
- Graphify is unnecessary for this bounded UI change; direct source/caller inspection is sufficient and Graphify did not run.
