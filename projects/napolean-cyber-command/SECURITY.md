# Security model: static browser edition

## Active boundary

The deployed runtime is dependency-free local HTML/CSS/JavaScript in a public Hugging Face Static Space. No backend, model provider, application key, telemetry, remote scanner or live target request is configured. The app does not execute submitted code. Browser policy and a same-origin asset policy constrain the interface; all user-authored results are rendered as text and exported Markdown escapes markup.

The five hats are analytical perspectives, not access privileges. Public project access and local browser storage are distinct boundaries. The public app does not expose another visitor’s browser-local records. Anyone with access to the browser profile and app origin can potentially access its IndexedDB results. There is no application encryption, shared-team authentication, individual attribution, immutable audit log or multi-tenant database.

## Local data lifecycle

Raw submitted source/log/scenario text is not persisted. Derived assessment metadata, generated candidates, mission plans and analyst notes are stored in IndexedDB on the current browser/profile/origin. Redaction is best-effort and not a guarantee that notes or metadata contain no secrets. Never paste credentials, private keys or unnecessary personal information.

Exports are created locally and contain potentially sensitive metadata/notes. They leave browser-managed storage when saved or shared. Deleting an assessment removes its current logical browser record; it does not erase downloaded reports, browser backups or forensic storage traces. Site-data clearing or storage eviction can destroy records. Export backups regularly and store them securely. Restore validates bounded, allowlisted records before saving fresh copies in a single IndexedDB transaction. Existing IDs are never replaced. Imported evidence is untrusted analyst-authored data, not authenticated proof. Client labels group records and never restrict access within the browser workspace.

Input and storage limits bound normal operations. Scope authorization and analyst evidence are required by the workflow, but local UI checks do not establish legal authorization or certify security. Inspect caller context, reachability and mitigations before confirming findings. Structured reviewer, reference, prerequisite, mitigation and method fields support this review; labels do not authenticate a reviewer. Remediation state and handoff notes are editable local records, not an immutable audit trail. No code execution, target URL fetching, credential validation, exploit generation, dependency advisory lookup or continuous monitoring runs.

## Concurrent edits and frozen reports

Finding saves require the revision originally loaded by the editor. The comparison and write occur atomically in IndexedDB; a stale editor must explicitly reload before retrying. This prevents accidental overwrites within a shared origin/profile, not malicious changes by someone controlling that profile. Assessment revisions also guard asynchronous report capture against intervening writes.

Up to three structured report snapshots are stored inside each assessment. They omit nested snapshots and preserve captured evidence independently of later edits. Snapshot exports and restores verify SHA-256 over validated canonical data. Backup preview checks schema and size; digest checks finish before restore writes. An attacker able to alter data can also recompute a digest: this is corruption detection, not a signature, authenticated identity or immutable audit record. Snapshot evidence remains sensitive and needs the same retention and export controls as current records.

## Coverage

Code nomination uses conservative text patterns, not a Python AST/parser. Lexical masking reduces comment/string call matches and bounded import recognition handles common aliases; unsupported Python syntax, shadowing and formatting can still cause misses or false positives. Alert interpretation trusts supplied labels; timestamps, duplicates and authenticity remain unverified. Exercise categories use disclosed keyword routing. Every automatic candidate remains unresolved until a human records a verdict.

No password prompt, fake session or client-side role is used as an enterprise security boundary. Customer records are not synchronized across users or machines. For a business service, agree scope, approved data, export handling, retention and qualified analyst review. Shared enterprise workflows would need a separately designed and verified backend and identity system, with their own costs.

## Historical source

Earlier Python/Flask/Gradio files may remain in the development bundle/repository as reference. They are not executed by the static runtime. Gradio/Pillow dependency advisories and hosted CORS issues were investigated during that abandoned hosting approach; do not mistake those checks for a full JavaScript security audit. See VERIFICATION.md for active coverage and the final hosting state.

No public reporting contact or security certification has been configured. Establish a monitored private contact before external customer trials. Do not publish customer evidence or secrets in issues.

## Engagement workflow extensions

Workbook and business delivery changes require the loaded assessment revision and use the same bounded, allowlisted, redacted local record model. A completed hat workbook is an analyst assertion, not automatic control validation. Continuation atomically checks the source revision and workspace capacity before adding a linked new record, leaving the source unchanged. Source records and their snapshots must be retained or backed up separately; continuation does not duplicate historical snapshots. Parent IDs are provenance links, not access permissions.

Cross-tab notifications carry record IDs only and are refresh hints, never authoritative evidence. Fresh reads and revision checks establish the saved state. Storage estimates describe the browser origin and may be missing or approximate; they are not a reservation or a durability guarantee. Backup export timestamps record initiation only. No cloud backup, authenticated reviewer, tenant boundary or new network request is introduced.
