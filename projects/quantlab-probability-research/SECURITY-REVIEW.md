# Data and cache security review — 26 October 2026

Scope: browser-facing static application, compared with deployed commit eb91769131ee5e3f1330b1359dda8351cd6d8453. Local source is an output directory, not a Git checkout. Existing public-space update authorization applies. This is a bounded source review with regression fixtures, not a security certification or a full platform penetration test.

## S1 — CSV allocation before validation

Verdict: confirmed-runtime; fixed. Severity: low, high confidence. A user must select a crafted local CSV. Before this change, a file below the 2 MiB cap could materialize excessive rows/columns on the UI thread before row-count rejection. The reviewer corroborated the pre-fix path with a 200,000-newline input. Scope of impact is local allocation/latency; no cross-user denial of service was demonstrated.

The parser now checks limits during tokenization: 2,500 price records plus header, 64 fields per record, 16,384 characters per field. See labs.js:50–80. test_data_quality.cjs checks delimiter-heavy input and field/row limits. Existing quoted fields, CRLF, quoted newlines and escaped-quote tests still pass.

## S2 — Clearing could be undone by asynchronous work

Verdict: confirmed-static, regression reproduced in a deterministic application-state harness; fixed. Severity: low, high confidence. A clear action during a CSV read, model import or benchmark request could be followed by the old continuation restoring results and cache entries. No external disclosure was demonstrated.

app.js:42–66 now invalidates operations on clear and checks a generation token after each await and before worker callbacks update results/cache. test_app_state.cjs holds module, CSV, response and JSON completion across clear, verifies no state restoration, then checks that a fresh run remains possible. Files, workers, current forecast and cache entries are cleared together. This releases app references; secure erasure of browser/OS memory is not claimed. Calculators are separate and remain available.

## Rejected candidates and retained protections

- CSV-to-DOM injection: dates must be valid ISO dates; SVG dates/model labels are escaped; error messages, quality warnings and audits use textContent. No reachable unescaped CSV-to-HTML sink found in reviewed paths.
- Input-driven external transmission: reviewed code reads files locally, computes in a worker and exports only on user action. The benchmark is a same-origin public fetch. CSP restricts scripts, workers and connections to self. No persistent storage API is used by the forecast cache.
- Cache misassociation: keys contain exact validated dates/prices plus a model revision. Source and cleaning metadata are rebuilt from the current input. Cloned cache values prevent accidental mutation. The saved Python benchmark is outside this cache.

## Cache contract

At most three entries in tab memory, least-recently-used eviction, ten minutes from insertion. Access checks expiration even if background-tab timer throttling delays reclamation. Timer cleanup also removes expired entries when scheduled. Cache hits are visibly labeled and exported as execution.cache_hit. Clear forecast data and a full reload discard application cache state. Public static files remain subject to browser/Hugging Face HTTP caching; asset query versions distinguish this release. benchmark.json uses fetch cache:no-cache, which requests revalidation, not a prohibition on storage.

## Evidence and coverage limits

Ran model, labs, scenarios, data-quality, cache and application-state Node suites. Browser exercised uploaded synthetic UTF-8 CSV normalization, BOM accounting, retained price-jump warning, cache-hit status and clearing. The independent source reviewer confirmed the clear-race correction and ran the three new suites.

No third-party vulnerability scanner, secret scanner, Ghost runtime or advisory scan ran. Browser runtime code has no third-party package dependencies. Python ZIP dependencies, hosting infrastructure, server response headers, HF authentication, browser extensions and operating-system storage were outside this pass. Graphify did not run; this small, familiar source tree was inspected directly. No account tokens were read or created. No live private financial dataset was supplied or cleaned.


## Validation release scope — 26 October 2026
Validation calculations remain in the local worker with bounded inputs and bootstrap repetitions. New outputs use textContent or escaped chart labels. Cache identity now includes validation protocol. Clear removes hidden derived validation fields and invalidates pending work. No new external runtime dependencies, credentials, telemetry, persistent storage or network destination were introduced. This is a scoped source review and regression pass; the infrastructure/scanner exclusions above remain.


## Provenance release scope — 26 October 2026
SHA-256 uses browser Web Crypto locally; no data is transmitted. The bounded tab history stores metadata, including data fingerprints and scores, not additional copies of raw inputs. Reports already contain prediction data; exports now also contain source metadata and inspection history. Fingerprints are identifiers, not anonymization guarantees. Clear removes current reports/history and invalidates pending digest completion. No new dependency, permission, account credential or persistent storage was added. Scoped source review and regression tests completed; infrastructure and scanner exclusions remain.


## Training-support release scope
New diagnostics run locally on the existing worker inputs and fitted training reference. Warning messages use textContent; percentage threshold symbols inserted into SVG labels are escaped. No new network request, dependency, credential, persistent storage or private-data destination was introduced. Clear wipes the support warning and exported/current reports retain the existing operation invalidation rules. The bundled research archive contains only public ECB rates, synthetic experiments and project source. Scanner/infrastructure exclusions from earlier sections remain.

## Saved-guess checker
Bounded 4 MiB JSON input; UTF-8 decoding rejects invalid bytes. Core validates schema, threshold, probabilities, anchor identity, chronology and positive finite prices. Parsed values are rendered through textContent; no eval, remote calls or persistent storage. Unknown metadata in imported records may be retained in exported check JSON; treat those files as untrusted data. Clear invalidates pending reads, clears inputs and derived check state, and disables export. Native browser file-picker and downloaded-file lifetimes remain browser-controlled. This is a focused code review, not a penetration test.

## Cost learning exercise
Pure bounded finite-number arithmetic runs synchronously in the tab. No network, file ingestion, credentials, account operations, persistent storage or trade placement. Output uses textContent. Exact calculation inputs and assumptions appear only in the local audit. This adds no native trading engine or upstream dependencies.

## Fail-closed native forms
Source audit identified a conditional GET fallback when JavaScript fails: named form values and a selected basename could enter a hosting URL (not the selected file body). Added CSP form-action none; all calculations are JavaScript-local. A regression test asserts the policy alongside same-origin connection/script restrictions. No normal-flow upload or persistent storage was found; provider logs, browser extensions and browser memory remain outside source review. See LEAK-AUDIT.md.
