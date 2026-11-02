# Analyst reliability and service workflow implementation plan

**Goal:** Fix the five reproduced defects, add the three accepted service features, then publish the verified release to the existing private Static Space.
**Architecture:** Existing vanilla JS and IndexedDB, outlined Interval branding. No Docker, new runtime dependency, paid resource, cloud customer database or external requests.
**Authority:** User explicitly requested proceeding one by one then pushing. Implementation choices below are commander defaults.

## Sequence and acceptance

1. Stale saves: findings have revision integers (legacy defaults 0). PATCH requires expected_revision, checked atomically against the current finding. Successful writes increment finding and assessment revision. Conflicts preserve the current record and the unsaved form, with an explicit reload/discard choice. Missing preconditions cannot silently bypass protection.
2. Draft protection: Close, X and Escape preserve the review form unless the user confirms discarding changes. Clear old record errors when switching finding. Canceling a discard leaves all fields intact.
3. Client filter: after refresh/deletion, invalid selected client resets to All clients; visible selection, register and backup scope agree.
4. Unattributed alerts: failures without actor and source identifiers do not claim identity correlation. Disclose omitted/unattributed counts; findings remain unresolved.
5. Report totals: only confirmed, non-resolved findings count as remediation work; unresolved validation and rejected findings have separate totals. Reuse a shared summary calculation for Markdown, print and queue.
6. Manual findings: bounded analyst-created evidence fields, always unresolved/low-confidence with origin manual. No submitted code execution, arbitrary verdict injection, or new authorization claim. Global 100-finding cap and 200-event cap remain transactional.
7. Remediation queue: confirmed findings only, showing owner/due/status with owner/status/overdue filters, keyboard access and responsive layout. Use UTC calendar dates consistently for overdue comparison.
8. Versioned report snapshots: at most 3 locally saved frozen snapshots per assessment. A snapshot captures sanitized report source data without nested snapshots, a version/time/source revision and SHA-256 of canonical captured data. Render/export through existing safe Markdown/DOM functions; no arbitrary imported HTML/Markdown rendering. Digest is corruption detection, not authentication. Restore validates snapshot schema and hashes before any write; snapshot source IDs stay historical. Current assessment IDs are still refreshed on restore. Preserve legacy backup support with explicit schema version handling.

## Ownership and checks

Backend owns static/local.js and tests/test_local.cjs. Frontend owns static/app.js, both HTML entries and static/style.css. Reviewer owns tests/browser_storage.cjs and tests/browser_ui.cjs, and read-only security integration review. Root owns shared contracts, docs, source manifest/ZIP and publication. No recursive delegation.

Each stage uses a failing meaningful regression then a passing implementation check. Final evidence: fresh Node/unit and publishing checks; real Chromium stale-write and draft/client/report/manual/queue/snapshot workflows; malformed/tampered snapshot import nonmutation; old backups still restore; mobile and print inspection. Push only reviewed allowlisted source with correct static/ and tests/ paths; verify private/Running and hosted behavior. No customer data or browser profiles uploaded.
