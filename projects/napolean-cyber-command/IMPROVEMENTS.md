# Business workflow improvements

This update preserves the free, static browser architecture. It adds recovery and analyst workflow capabilities without introducing a server, paid resource, Docker or model provider.

## Use the workflow

1. Create an assessment with an optional client label and explicit authorized scope. Labels organize the same browser database; they provide no access control.
2. Challenge nominated candidates. A confirmed verdict requires reviewer, reference/revision, prerequisites, mitigations and a substantive validation method. These are analyst attestations, not authenticated identities or independently verified proof.
3. Record remediation owner, due date, status and retest notes. Record handoffs between assigned perspectives with the next evidence request. Tracking reflects current local state; the app is not an immutable audit system.
4. Use verdict and severity filters, or next-unresolved navigation. Export Markdown or print an executive report that separates confirmed, unresolved and rejected findings and includes coverage limits.
5. From the register, download a workspace or selected-client backup. To recover, choose Restore backup, review the validated count and client labels, and explicitly confirm adding copies. Existing records remain intact. Legacy individual assessment JSON exports are also supported.

Restore accepts at most 5 MB and the workspace holds at most 100 assessments. Export smaller client groups or individual assessments when needed. Restore generates fresh assessment/finding IDs. Complete files are validated before mutation; storage writes are atomic. Legacy confirmed verdicts without complete structured evidence become unresolved on import. A full 200-entry history is retained; restore provenance is shown in the summary when no new history entry fits.

## Evidence ledger from implementation

| ID | Root cause / path | Evidence and disposition |
| --- | --- | --- |
| IMP-001 | Alert batches could nominate 101 findings while import allowed 100 | Runtime fixture reproduced a valid batch that could not round-trip. Fixed with a disclosed 100-candidate cap and priority for high-severity alerts; regression checks restore compatibility. |
| IMP-002 | Restore provenance appended to a full 200-entry history | Boundary fixture reproduced the recovery gap. Fixed by preserving all existing history and recording provenance in the summary when history is full. |
| IMP-003 | Redaction expanded otherwise valid fields beyond restore limits | Synthetic token-assignment fixture reproduced the mismatch. Fixed by checking lengths after redaction before save; malformed updates do not partially mutate records. |

These are recoverability and data-quality defects found during implementation, not demonstrated attacker exploitation. Security review covered the local input, rendering, import, persistence and export paths. No new exploitable vulnerability was confirmed within that bounded scope.

## Limitations

Code nomination remains lexical and low confidence. It does not execute Python, provide taint tracking or prove exploitable input flow. Detection fixtures measure their own examples and are not a general accuracy claim. Browser evidence covers installed Chromium; other engines, actual disk exhaustion, storage eviction and a full accessibility audit remain unverified. Quota and policy-denial tests use labeled fault injection.

The update is delivered as source and a refreshed ZIP. See the deployment receipt for publication status and the verified private Space revision.

## Analyst reliability release — 2026-11-02

Finding saves now require the loaded revision. If another tab saves first, the stale form keeps its draft and offers an explicit reload/discard choice. Close, X and Escape protect unsaved review and manual-finding fields; old dialog errors clear on a fresh finding. Deleting a client’s last assessment resets an invalid client filter to All clients.

Alert failures with neither actor nor source are counted as unattributed rather than correlated as one identity. Markdown, print and the remediation queue use the same totals: unresolved validation, confirmed static/runtime, rejected, and confirmed-only non-resolved remediation.

Use Add analyst finding for discoveries outside the heuristic patterns. Entries start unresolved/low confidence and require the usual evidence review. The Remediation tab filters confirmed findings by owner, status and overdue date in UTC. Reports captures up to three frozen structured versions, with JSON/Markdown download and print. SHA-256 detects corruption; it does not authenticate authorship or evidence. Restore verifies snapshot digests before committing any imported records.

## Engagement workflow release — 2026-11-02

1. Printed reports include root cause, input-to-impact path, prerequisites, mitigations, mission guidance, role workbooks and business delivery notes. Current printing reads the latest saved assessment; unsaved delivery text remains in the form and is excluded.
2. Current imported confirmations with missing structured evidence or short decision notes become unresolved. Incomplete confirmations inside frozen data reject instead of changing historical content. A fixture captured from the previous release proves valid historical hashes remain compatible.
3. Cross-tab ID-only hints and focus checks show a saved-change notice. Refresh is explicit and warns before discarding drafts. Finding/workbook/delivery revision conflicts retain unsaved fields.
4. Each selected hat has an editable owner, status, evidence reference, expected/observed results and review decision. Completing an entry requires evidence, observed result and decision.
5. Continue engagement atomically creates a fresh linked record while preserving the source history and frozen reports, even at the 200-event limit. Current evidence/tracking/workbooks/delivery copy; old history and snapshots remain in the source.
6. Delivery stores an analyst-written executive summary, business impact and prioritized recommendations. Client remediation filters confirmed records across local assessments by client, owner, state and overdue UTC date, with 50 rows per page. Continuations can repeat source findings; inspect lineage before combining counts.
7. Workspace status shows counts, approximate serialized bytes and optional browser-origin usage/quota estimates. Unknown metadata is shown as unavailable. Warnings flag approaching record/history/size/report limits. Recovery guide and last backup export initiated time improve operator visibility without claiming a file was saved.
