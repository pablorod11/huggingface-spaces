---
title: Napolean Cyber Command
short_description: Cybersecurity reviews, evidence and remediation tracking
emoji: 🛡️
colorFrom: gray
colorTo: blue
sdk: static
app_file: index.html
pinned: false
---

# Napolean Cyber Command

A no-cost, browser-based cybersecurity workbench for analyst-led business security reviews. Five perspectives share one local evidence ledger: red, blue, white, black and purple hats.

Public project: [PabloRod11/napolean-cyber-command](https://huggingface.co/spaces/PabloRod11/napolean-cyber-command).

## Zero-cost runtime

The deployed app is HTML, CSS and JavaScript. It uses no Docker, backend server, GPU, paid plan, model API, application keys or runtime packages. Hugging Face documents that [Static Spaces are free and use no compute](https://huggingface.co/docs/hub/spaces-sdks-static). Platform terms can change; this project does not provision chargeable resources or subscribe to anything.

All assessment processing runs in your browser. Results and analyst notes are saved in IndexedDB for that browser profile and app origin. They are not uploaded to a shared customer database. The hosted Space is public. Browser storage is local to each browser profile and origin; it is not application authentication, encryption, or tenant isolation.

## Working flows

- **Code review:** bounded lexical Python-text patterns mask comments/quoted examples and recognize simple subprocess imports/multiline calls to nominate potential eval/exec, shell-enabled invocation and embedded-credential concerns. This is not a Python parser, AST analysis, taint tracking or vulnerability validation. Matches are always unresolved candidates and may be false positives.
- **Alert triage:** bounded JSON event batches nominate repeated login failures, privilege changes and malware reports. Timestamps, authenticity, duplicates and actual compromise need analyst validation.
- **Exercises:** disclosed keyword routing selects ransomware, supply-chain, identity/phishing, cloud or generic tabletop missions. No model or simulated attack runs.
- **Five-hat workbooks:** record owner, progress, evidence references, expected/observed results and a review decision for each assigned perspective. Completion requires evidence, an observed result and a decision; these are analyst attestations.
- **Five perspectives:** scoped adversary planning, defense, independent review, attacker-perspective lab modeling and joint detection validation. They are analytical perspectives, not running autonomous agents or user permission roles.
- **Evidence:** record structured analyst evidence, remediation ownership and retest notes; filter candidates by verdict/severity and hand off work among assigned perspectives. Confirmation is an analyst attestation, not automated proof.
- **Analyst findings:** add a bounded evidence-backed candidate manually; it starts unresolved with low confidence and uses the same human review process. Stale finding saves are rejected so a second tab cannot silently overwrite a newer decision. Unsaved finding, manual-entry and handoff drafts prompt before dismissal.
- **Remediation queue:** filter confirmed findings by owner, status and overdue date (UTC). Rejected and unresolved candidates are excluded from open remediation totals.
- **Report versions:** capture up to three frozen local reports per assessment, export JSON/Markdown or print a saved version. SHA-256 detects corruption, not authenticated authorship or tamper-proof signing.
- **Engagement continuation:** create a linked fresh assessment when history or report limits approach. The source retains its original history and frozen reports; the continuation has fresh record/finding IDs and a new history.
- **Business delivery:** save an executive summary, business impact and prioritized recommendations; use the client-wide confirmed remediation view to review owners, states and overdue dates across assessments.
- **Client delivery:** organize by client label, export Markdown, and print an executive report with verdict counts and coverage limits. Client labels provide organization within one browser workspace.
- **Recovery:** download a versioned workspace or client backup, preview a validated file, and restore additive copies atomically. Existing records are never replaced. Legacy single-assessment JSON exports are accepted after validation.

The workspace shows capacity warnings and optional browser-origin storage estimates. Last backup export initiated means the app requested a download; it does not prove a file was saved. The recovery guide explains export, preview and restore as fresh copies. Cross-tab notices offer an explicit refresh and preserve unsaved drafts; current printing reads saved data again.

Raw source, alerts and scenario prose are not retained. Generated evidence omits raw values. Names, scopes and notes may still contain sensitive information: redaction is best-effort. Use synthetic or approved minimal data for pilots.

## Open and run

Open the public Space; a Hugging Face account is not required to view the app. No application password or Space Secrets are needed. Keep the same browser profile and app URL to access the same local records. Browser storage restrictions or iframe partitioning can prevent persistence; use the top-level app URL when necessary. The app reports storage failures rather than silently pretending records were saved.

To run locally without a build step:

```sh
python3 -m http.server 7860 --bind 127.0.0.1
```

Open http://127.0.0.1:7860/static/index.html. Python only serves files; there is no Python assessment backend. Use workspace backups regularly: clearing site data, changing browser/profile/origin, private browsing or storage eviction can remove local records. Exports contain assessment metadata and analyst notes and must be handled accordingly.

## Verify

```sh
node --test tests/test_local.cjs
node --check static/app.js
node --check static/local.js
# Optional real Chromium checks; supply an existing Playwright module path:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/browser_storage.cjs
# With the local server running:
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/browser_ui.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright node tests/browser_engagement.cjs
```

Browser checks use an existing Playwright installation and its Chromium binary; they add no runtime dependency. Set `PLAYWRIGHT_EXECUTABLE_PATH` if using an existing compatible Chromium executable.

The Hugging Face repository also retains the earlier Python engine, Flask API and Gradio experiment as historical reference. The standalone static source ZIP excludes those server dependencies. They are not loaded or installed by the deployed Static Space. Its old runtime dependency advisories are not an active JavaScript dependency; see [verification](VERIFICATION.md) for coverage and history. No Python runtime is needed to use the hosted app.

## Reuse

Duplicate the Static Space or publish the allowlisted static source into a NEW private project using the optional helper:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-deploy.txt
.venv/bin/hf auth login
.venv/bin/python deploy_hf.py --repo-id YOUR_ACCOUNT/ANOTHER_PROJECT
```

The helper creates only `sdk:static`, never reuses an existing repository, and requests no compute, paid hardware or application secrets. A Hugging Face publishing token is used locally only by the publishing tool, never embedded in browser assets.

## Business use

This is a prototype for analyst-led reviews and training. Customer teams do not share case state automatically. An analyst can conduct scoped reviews, export a report and manage the engagement separately. It does not include shared SaaS accounts, SSO/RBAC, billing, continuous monitoring, SIEM integrations or compliance certification.

See [improvement guide](IMPROVEMENTS.md), [service offering](SERVICE.md), [security model](SECURITY.md), [verification](VERIFICATION.md), and [provenance](PROVENANCE.md). Validate customer demand and data-handling arrangements before a pilot. No automated count or zero-candidate result establishes that a system is secure.
