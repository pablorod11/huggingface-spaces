# Privacy leakage review

Scope: active static source only: app.js, worker.js, index.html, cache.js, provenance.js, forward.js, execution.js, and network/storage/injection searches across active JavaScript modules. No credentials or private uploaded CSVs were read. Browser/network traces and hosting headers were not inspected by this reviewer.

## Finding: native form submission can expose inputs when JavaScript is unavailable

- `outputs/quantlab-static/index.html:48–51`: forward-form has no action/method and has named file/date/close/confirmation controls.
- `outputs/quantlab-static/index.html:66`: cost-form similarly has named financial inputs and no action/method.
- `outputs/quantlab-static/index.html:6`: CSP does not declare form-action. default-src does not substitute for form-action.
- Normal execution prevents these submissions (`app.js:143` forward handler and the cost submit handler). If JavaScript is disabled, blocked or fails before handler registration, browser-native submission defaults to GET the current document URL. The query can contain the entered next date/close and cost assumptions, and a selected file basename; this does not upload the file body through a GET form.
- Impact: privacy data could enter hosting request logs/history rather than remain exclusively in local application memory. This is conditional fallback behavior, not an observed normal-flow upload.
- Suggested minimal repair: add `form-action 'none'` to the existing CSP because every form performs local calculations. Verify native submit is blocked while JavaScript handlers still calculate normally. Explicit non-submitting buttons or a stronger failure UI are alternatives.

## No additional concrete leakage found in the reviewed normal flow

- `app.js:107–113`: file bytes are read locally; validated closes go only to a same-origin browser worker. Every awaited CSV/module/digest boundary and worker message checks an operation token before mutating state.
- `app.js:122`: sole application fetch is fixed relative benchmark.json with no upload body, dynamic query or input interpolation. Module imports, worker path and worker imports are fixed relative app assets (`app.js:108,113`, `worker.js:2`).
- `cache.js:3–15`: bounded three-entry ten-minute cache is an in-memory Map, with structured clones and timer removal. No localStorage, sessionStorage, IndexedDB, cookies or service-worker registration was found across active JS.
- `provenance.js:4–18`: normalized dates/closes are hashed locally using Web Crypto. History holds bounded cloned metadata in memory; the digest is not anonymous evidence if exported and matched against a known input series.
- `app.js:94–103`: clear increments the run token, terminates the worker, empties cache/journal/current report, clears forecast DOM, and invokes forward reset. `app.js:137–141` also increments the forward token and clears file/date/close/outcome state. Clear invalidates pending read/hash work but cannot erase detached VM memory or completed downloads.
- `app.js:143–160`: forward JSON is bounded to 4 MiB, decoded/parsed locally, and stale file reads are token-guarded. Untrusted strings go through textContent/JSON.stringify-to-textContent, not HTML evaluation. Original selected filenames are not inserted into source metadata.
- Chart innerHTML is generated SVG. Input-derived dates and names are escaped; coordinate fields derive from bounded numerical parsers/model calculations. No eval/Function constructor or HTML insertion from forward JSON was found.
- Downloads (`app.js:124,161`) use explicit user-triggered Blob object URLs revoked after one second. Exported reports can contain dates, the last close, return-derived information and fingerprints. Sharing those files can reveal sensitive series information; this is deliberate local export, not an automatic network upload.
- `execution.js` is arithmetic-only and has no persistence/network/DOM side effects. Calculator fields/results remain in the DOM; Clear my results currently clears forecasting/forward state, not all independent calculator inputs.

## Verification run

Passed: test_app_state.cjs (including pending digest clear and delayed forward-file clear), test_forward.cjs, test_provenance.cjs, test_cache.cjs, test_worker.cjs. No source edits made.

## Boundaries

Hugging Face page/chrome analytics, provider access logs, response headers, browser extensions, operating-system memory, browser form restoration/back-forward cache, downloaded files and same-origin code compromise are outside this static-source audit. CSP self restrictions reduce external egress but do not prove no same-origin exfiltration under compromised scripts. No active network capture or JavaScript-disabled browser reproduction was performed here; the native-form finding is inferred from explicit HTML/default browser submission semantics and should be browser verified by the commander.

## Repair recheck

The commander added `form-action 'none'` to `index.html:6`. Source now explicitly prohibits every native form navigation/submission, including default same-document GET fallback. Existing JavaScript submit listeners preventDefault and calculate locally; this CSP directive does not restrict handler execution, file reads, Web Crypto, workers or Blob exports. `test_privacy_policy.cjs` and `test_app_state.cjs` both passed on the repaired source. The original native fallback finding is closed at source-policy level. Browser enforcement/response delivery and live traffic were not verified by this reviewer.
