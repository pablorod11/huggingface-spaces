# Business improvements implementation plan

**Goal:** Deliver the accepted review improvements in sequence using the existing free static application.
**Architecture:** Vanilla JavaScript and IndexedDB. No network runtime, Docker, paid infrastructure, new runtime dependency or claim of tenant isolation. Existing records remain readable.
**Authority:** User requested all proposed improvements one by one. Preserve current visual identity; implementation decisions below are commander defaults.

1. Versioned backup and restore: export an envelope with format/version/records. Validate the complete bounded document, sanitize accepted fields, preview record counts, then atomically add copies with new IDs. Never replace existing records. Reject malformed/oversized documents without mutation.
2. Structured evidence and reporting: reviewer label, reference/revision, prerequisites, mitigations and method required for confirmations. Treat these as analyst attestations. Add remediation owner, due date, status and retest note. Markdown executive summary and browser print view separate verdict counts and disclose limits. Record role handoff notes.
3. Browser persistence verification: real IndexedDB multi-tab writes, denied/aborted transactions and restore rollback; use existing browser capabilities with no paid tools.
4. Detection fixtures and improvements: ignore Python comments/string contents for call nomination, recognize imported subprocess aliases and bounded multiline calls. Keep nomination low confidence; disclose remaining parser/dataflow limits. Add positive/negative benchmark fixtures.
5. Client organization: optional client label defaults to Unassigned for legacy records. Filter register and workspace backup by client. No tenant/access-control claim.
6. Mobile/accessibility: responsive record tables, verdict/severity filters, focus restoration after save and next unresolved action. Preserve keyboard navigation.

For each stage: write meaningful regression cases, observe failures, implement, run related checks; integrate only after interfaces settle. Root owns source packaging/docs and final verification. Engine owner owns local.js and Node tests; UI owner owns app.js, both HTML entries and style.css. Security review is read-only. No automatic publication in this improvement mission.

## Execution outcome

All six stages implemented and checked. Root integrated security/browser review fixes and refreshed static-only packaging. See VERIFICATION.md for exact checks and residual limits. No publication performed.
