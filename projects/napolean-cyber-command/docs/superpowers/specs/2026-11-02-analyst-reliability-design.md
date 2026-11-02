# Analyst reliability release

The owner approved implementing the five reproduced review findings and the three proposed service features, then pushing the finished release. Preserve the free static architecture, no Docker, browser-local persistence, Interval identity, and honest analyst-attestation language.

Protect a finding from stale saves with optimistic revision checks in its actual IndexedDB transaction. A conflict leaves newer stored fields and the user's unsaved form intact. Closing a changed review requires a discard decision. Refreshing the register must keep client selection, visible records and backup scope consistent.

Unattributed failed-login events must not claim shared actor/source identity. Report calculations must separate unresolved validation, rejected candidates and confirmed remediation work. Sharing one summary function avoids independent counting rules.

An analyst can add a scoped manual finding when the limited automatic rules do not nominate it. New manual findings are unresolved and low confidence, carry an origin label, respect existing field/finding/history limits, and use the same review requirements as automatic candidates. Evidence can contain sensitive information; redaction remains best effort.

A remediation queue shows only confirmed findings with ownership, date and state, with owner/status/overdue controls. Calendar comparisons use UTC dates and label that convention. Rejected candidates do not become action items automatically.

Report snapshots capture sanitized report data without other snapshots, a local sequence number, creation time, source revision and SHA-256 of canonical data. Save at most three per assessment. Later finding edits cannot alter captured content through application operations. A digest detects corruption when compared with an independent expected value; it cannot authenticate a reviewer or stop an owner of the browser/profile from rewriting local data. Render snapshots via the existing text/escaped-Markdown paths, never as imported HTML.

Backup version 2 carries optional revisions, origin and snapshots; legacy version 1 and single-assessment exports remain supported. Preview checks schema and limits; restore also checks digests before starting its atomic batch. Current assessment/finding IDs become fresh copies while captured historical report IDs remain historical. Imported claims remain unverified attestations.

Review and verify each change with regressions, actual Chromium workflows, malformed/tampered import checks, and desktop/mobile/print inspection. Publish allowlisted source only after integrated checks pass. Keep the previous source ZIP locally as a rollback reference; do not upload records or browser profiles.
