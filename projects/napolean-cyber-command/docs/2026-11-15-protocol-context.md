# Protocol context integration

Approved scope: original local cards for HTTP/HTTPS, TLS, DNS and SSH in Role tasks, an attributed external Protocol Explorer link, and explicit draft prompts for existing role workbooks.

## Contract

- Same-origin static protocols.js, loaded before app.js in both entry points. No dependencies, network calls, embeds or CSP relaxation.
- Explicit topic selection changes temporary UI state only. A constant external URL opens only on click, with no opener, referrer or record-derived parameters.
- Add prompts opens the existing workbook dialog and appends study context to Expected result. Preserve existing text, owner, status, evidence, observations and decision. Enforce the existing 2000-character limit without truncation; repeated addition is idempotent. Nothing saves until the normal Save action.
- Keep raw input disposal, exercise routing, findings, storage schemas, backup versions, snapshots and report validation unchanged. Learning material never counts as observed evidence.
- Original summaries cite primary RFCs. Explorer is an external reference by Dilum Sanjaya; no Explorer code, traces or lesson prose are copied.

## Implementation and checks

1. Catalog owner writes failing unit tests, then implements four topics, fixed Explorer URL and pure bounded/idempotent draftExpected helper.
2. UI owner renders a collapsible Protocol context inset and connects draft actions to the existing workbook. Preserve the app layout and keyboard controls.
3. Test owner writes a failing browser acceptance flow before UI integration, then verifies selection privacy, draft/cancel/save behavior, report continuity and mobile layout.
4. Run existing Node engine, deployment and browser suites; inspect desktop/mobile UI. Refresh deploy allowlist, source manifest, provenance and verification notes.
5. Publish the reviewed files atomically to the existing HF Space, verify pinned release bytes/runtime and the live panel. Sync the dated GitHub source snapshot and manifest.

## Review focus

Preserve nonempty workbook notes; reject oversized additions; keep manual status/evidence unchanged; no requests on topic selection; restore old backups and retain frozen snapshots; root/static parity; visible labels/focus at 390px.
