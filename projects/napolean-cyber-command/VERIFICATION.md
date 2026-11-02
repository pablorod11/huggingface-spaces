# Verification: browser service improvements

Date:2026-10-31. Final runtime: private Hugging Face Static Space, sdk:static, app_file:index.html. No Docker, Gradio, compute, backend/API, model, application key or third-party runtime package is loaded by the deployed app.

## Active checks

- The prior release had 8 Node checks. The improvement suite adds versioned/legacy restore validation, hostile fields, atomic capacity failures, structured evidence, invalid dates/status, handoffs, round-trip limits and lexical detection fixtures. Final counts and browser outcomes are recorded below after integration.
- `node --check static/app.js` and `node --check static/local.js`: passed.
- Optional publishing helper:4 unittest checks passed for private sdk:static creation, no compute/secrets, source allowlist and preflight validation. Python is used only for this optional publication helper, not runtime.
- Independent source review: no important security or correctness issue confirmed within the static files and test scope. No external submission, eval/Function execution, remote assets or raw-submission persistence was found. User-authored evidence uses textContent; Markdown escapes markup.

## Actual browser evidence

Using synthetic fixtures only, the real in-app browser opened actual IndexedDB, created a Python-pattern assessment, assigned all five perspectives and saved an analyst decision. A second browser tab reopened the same origin and showed the saved assessment with zero unresolved candidates after that decision. A local JSON download was read and contained the expected saved verdict; it contained no raw `content` field. The input is never executed.

Transactional IndexedDB writes resolve only on transaction completion. Record-count checks and creation, and review reads/history appends/writes, remain in one readwrite transaction. Node unit tests use an in-memory store. The new Chromium integration harness uses real IndexedDB across two pages, verifies duplicate-key rollback and injects a quota exception to check real transaction rollback. Policy denial is simulated. Actual disk exhaustion, storage eviction and broad browser/version coverage remain unverified. The UI surfaces storage failures; it does not silently claim successful saves.

The interface was inspected at the available narrow and wide browser surfaces. A complete WCAG audit, responsive matrix and reduced-vision testing have not been performed. Terminal typography and labels are deliberate design choices. No fonts/CDNs or external assets are requested by application code. A meta content-security policy denies network connections from the application document.

## Evidence ledger and historical changes

| ID | Root cause / evidence | Final disposition |
| --- | --- | --- |
| NS-001 | Quoted multiword secret and bearer metadata survived an earlier redactor, runtime-confirmed by a reviewer | Fixed; final JavaScript regression checks redaction. Sanitization remains best-effort, never a secret-handling guarantee. |
| NS-002 | Hosted Gradio CORS could expose credentialed callback results to foreign origins in a local hosted-host test | Fixed in historical Gradio code with outer same-origin middleware, then eliminated from active runtime by moving to static browser-only processing. No Gradio endpoint is deployed by static SDK. |
| NS-003 | Historical Gradio/Pillow lock matched39 advisory records | Not an active static dependency; no Python package is installed or imported for this static runtime. The historical advisory JSON is retained for transparent provenance, not a clean bill for optional Python code. |
| NS-004 | Native ZeroGPU hosting required GPU functions; account rejected a CPU downgrade without PRO | Final static SDK uses no compute and avoids that requirement. No dummy GPU workload or subscription was added. |

Earlier31 Python/Gradio checks passed during development, but they do not prove the final static implementation and are not counted as its active tests.

## Limits

This is an analyst-led prototype, not a multi-user SaaS, trained model, continuous monitoring platform or security certification. Code checks remain limited lexical patterns, with comment/string masking and bounded alias/multiline recognition; full Python syntax and dataflow remain unverified. No vulnerability is automatically confirmed. Raw source/log/scenario text is omitted from stored records, while names/scopes/notes may still be sensitive. Local origin/profile access and downloaded exports are security boundaries controlled by the operator.

Real customer hosting, identity, shared records, encryption, backups, immutable audits, legal agreements and incident operations are outside this no-cost browser prototype. Versioned workspace/client backups and legacy single-assessment exports can be restored as fresh copies after validation. Restore has a 5 MB bound and a global 100-record capacity. Oversized workspace exports must be split by client or assessment. Local backups require operator-managed retention; there is no managed cloud backup. Structured reviewer/reference information is an attestation; remediation fields retain current state and do not form immutable audit history.

## Hosted delivery

Final static conversion and hosted browser checks are recorded in the final handoff. Repository source and settings must remain private unless the owner explicitly changes visibility. No billing or account subscription was changed.


## Improvement release verification

Source checked on 2026-10-31 in the local project directory. The active engine suite passes 24 Node tests. The original detection fixture table covers positive nominations and negative comments/string/declaration examples; nested-call regression cases also pass. These are fixture results, not measured real-world precision or recall.

The `browser_storage.cjs` harness passes 12 Chromium checks: actual IndexedDB reload, concurrent tab decisions, duplicate-key rollback, quota fault rollback, simulated policy denial, fresh-ID restore, malformed-file nonmutation, actual UI backup/restore, history cap, full-history recovery, concurrent 100-record cap, and no external requests or uncaught page errors.

The separate `browser_ui.cjs` workflow passes creation with aliased multiline source, incomplete-confirmation guard, structured evidence and remediation save, focus restoration, verdict/severity filters, next unresolved, role handoff, printable executive report, client-filtered backup download, preview/confirmed restore, and 390px page overflow checks. Desktop and mobile screenshots were inspected. JavaScript syntax checks and all 4 optional publisher tests pass. Both HTML entries agree after their asset path normalization.

Source review also fixed three UI mismatches: stale filters on creation, unclear method requirements and missing legacy-evidence warnings in print. Client labels remain organizational. Reviewer/reference history is retained in review events; complete prior tracking/evidence snapshots and immutable audits are not provided.

No Docker, server-side analysis, paid resource, model API or runtime dependency was added. Browser tests use an already installed Playwright/Chromium setup. No Graphify mapping or upstream scanner runtime was needed for this small known source tree; source searches and direct inspection supplied navigation evidence. Final coverage remains bounded; no exploitable finding was confirmed in this reviewed local flow.

The local deployment receipt records publication status and the verified hosted revision. An initial browser interruption was resolved by reopening the correct HTTPS project tab.

## Analyst reliability release — 2026-11-02

The engine suite now passes 34 Node checks, including exact finding revisions, same-finding concurrent conflicts with explicit reload/retry, unattributed alerts, confirmed-only remediation totals, manual provenance and transactional caps, three frozen report versions, snapshot capture races, unchanged historical exports after edits, legacy/v2 backups, digest-tamper rejection before mutation and the 5 MB single-record growth limit. JavaScript syntax and all four optional publisher tests pass. Final real-browser outcomes are recorded below.

The five reproduced defects were reliability/data-quality problems: stale updates overwrote newer tracking, dialog dismissal lost drafts, a removed client label stranded the register, missing alert identity fields created a false group, and rejected candidates inflated remediation totals. They are fixed within the local workspace model. Manual findings, the confirmed-only queue and frozen reports do not add authenticated reviewers, shared access, cloud persistence or tamper-proof audits.

The updated real Chromium storage harness passes 15 checks, including same-finding conflict handling, frozen snapshot limits/integrity, fresh current IDs with historical IDs preserved, legacy restore, transactional rollback, capacity bounds and no external requests or uncaught page errors. Source review traced snapshot validation, safe rendering/export and asynchronous hash-to-transaction revision checking. No exploitable vulnerability was confirmed within this bounded source and synthetic-browser coverage.

A near-limit regression verifies that a valid exported record within four bytes of the 5 MB limit still restores. When adding restore provenance would exceed that limit, the imported history and summary are retained without a new annotation; current IDs are still regenerated and snapshot hashes remain verified.

Final integrated UI workflow passes: concurrent stale-save conflict and explicit reload/reopen, canceled Close/X/Escape draft preservation for review/manual/handoff, structured review, concurrent manual entry selection, confirmed owner/status/overdue queue, frozen JSON download, print totals, backup preview/restore, client reset after deletion, anonymous alerts, 390px overflow and no uncaught page errors. Desktop/mobile screenshots were inspected. Final source checks: 34 Node tests, 15 Chromium storage checks, full Chromium UI workflow, 4 optional publisher tests and both JavaScript syntax checks passed. No runtime dependency, Docker, paid resource or external request was added.

## Engagement workflow release — 2026-11-02

Final engine suite: 42 Node tests pass, including incomplete imported confirmation notes, workbook completeness/CAS/redaction, actual previous-release snapshot hash compatibility, full-history continuation with unchanged source, concurrent continuation capacity, business delivery round-trip and optional metadata failures. All 4 optional publisher tests and JavaScript syntax checks pass. A real historical snapshot fixture was generated from the archived previous release, not recomputed using the new normalizer.

The expanded Chromium IndexedDB suite passes 16 checks. The new continuation check creates a source with 200 history events and 99 total records, races two continuations, and observes exactly one fresh copy at 100 records with the source unchanged. Quota/policy exceptions remain labeled fault injection.

The engagement browser workflow checks full printed evidence and missions, role workbook completion and canceled dismissal, delivery conflict/draft preservation, focus-triggered cross-tab warning, canceled/accepted refresh, fresh printing while an unsaved delivery draft remains intact, continuation, recovery guide, backup export initiation metadata, two-client confirmed-only queue, 50-row pagination/filter reset and 390px overflow. Blocked BroadcastChannel startup and unknown storage metadata are fault-injection checks. Desktop/mobile screenshots are inspected. Original UI regressions are also run; its print assertion now waits for the intentional asynchronous fresh saved-record read.

Source review covered optional-field import allowlists, canonical old snapshot preservation, assessment CAS, atomic continuation read/count/add, safe text rendering, no new external asset/network/runtime dependency, optional diagnostic failure handling and client-label limitations. No exploitable vulnerability was confirmed in this bounded local synthetic scope. Other browser engines, real disk exhaustion/eviction, a full accessibility audit and real customer workflows remain unverified. Graphify/upstream scanner runtimes did not run; direct source and regression evidence were used for this known small tree.

Final integrated result: 42 engine tests, 16 Chromium storage checks, original browser UI workflow, new engagement browser workflow (including optional-channel and unknown-metadata fault injection), 4 publisher tests and syntax/HTML checks all pass. Original print tests now await fresh-read completion; the optional metadata test waits for the asynchronously rebuilt status panel. No application failure remained in the final reruns. Clean desktop/mobile screenshots were inspected before publication.
