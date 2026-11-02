# Analyst service improvements

The user approved implementing all findings from the project review, one by one. Keep the existing static browser application and visual design, with no Docker or chargeable runtime.

An analyst should recover local work from an exported backup, document the evidence behind each verdict, track remediation and hand off tasks among the five perspectives. A client label organizes assessments within the same browser workspace. It provides no access control. A printable executive view and Markdown report support delivery to business customers.

Restore treats every uploaded file as untrusted data: bounded, versioned, allowlisted validation before preview, and fresh IDs for additive copies. The write must be one transaction, preserving existing records and rolling back on errors. Existing single-assessment exports should remain recoverable when they pass the same validation. Imported notes remain unverified analyst statements.

Confirmation requires a reviewer label, source reference/revision, prerequisites, mitigations and validation method. These fields attest to work done outside the app; they do not authenticate reviewers or validate exploitation. Remediation tracking records owner, due date, status and retest notes. Role handoff notes record decisions without launching agents or live tests.

Code nomination should reduce comment/string false positives and recognize bounded multiline subprocess calls and common imports. It remains a limited lexical check, without Python execution, full parsing, taint tracking or security certification. Named positive and negative fixtures provide inspectable detection evidence.

Actual Chromium IndexedDB tests should check concurrent updates across pages, atomic restore, and error handling. Injected storage failures must be labeled as simulations, not real disk exhaustion. The interface should retain keyboard focus after review, support next-unresolved navigation, expose severity/verdict filters, and make records readable on narrow screens.

Builder decisions: no additional runtime dependency; additive copies rather than replacing IDs; client label defaults to Unassigned; same global limit of 100 records and 200 history entries. New metadata can be exported and must be treated as potentially sensitive. Publication remains a separate operation from source implementation.
