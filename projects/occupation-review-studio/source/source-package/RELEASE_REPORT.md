# Release evidence — 16 October 2026

**Independent case study with simulated business requirements.** Prepared for PabloRod11. Reviewed and polished local release; publication has not occurred.

## What is included

A trained TF-IDF/logistic-regression occupation classifier, JSON weights with standard-library inference, a Gradio review app, transactional SQLite review logic, official-source data preparation, grouped evaluation, provenance, a model card, and the BSA requirements/acceptance case study.

Model version: `onet31-tfidf-8cc1b32a235b`. Model SHA256: `128c9d92d87a434a9039a7a8ce8c116603c418ccce17e0ef04e8c01de5c10e11`.

## Executed checks

- Downloaded official O*NET® 31.0 task and occupation CSVs; sources and hashes recorded in `data/provenance.json`.
- Validated the exact occupation allowlist against the source; replaced obsolete education code 25-2052.00 with current specific kindergarten/elementary codes before training. No unmapped code was silently accepted.
- Prepared 689/143/173 train/validation/test tasks across 35/10/10 disjoint occupations. Removed all repeated normalized-text clusters; checked occupation and normalized-text isolation.
- Trained with fixed hyperparameters and seed 42. Repeated deterministic training after improving content-based versioning and the leakage assertion; unchanged model settings, split hashes, predictions and metrics. No tuning used test results.
- Selected auto-accept threshold 0.52 using validation only (63 correct among 66 accepted). Frozen escalation threshold 0.50.
- Measured final-test accuracy 0.803468, macro F1 0.785420. Auto-accept coverage 77/173; 76/77 accepted predictions correct. These are small grouped-holdout results, not operational guarantees.
- Checked JSON reload parity on 319 inputs; maximum probability error 2.78e-16, below 1e-10.
- Ran `python -m unittest discover -v`: **28 tests passed**. See `test-results.txt`. Includes invalid model inputs, routing/configuration, human override, simulated permissions/ownership, forced escalation, out-of-scope closure, stale revisions, immutable completion, audit-failure rollback, session isolation, split checks, feedback export, spreadsheet cell escaping, and app construction.
- Ran data preparation self-check and offline reproduction. Split hashes remained identical.
- Ran publication dry-run; model hash matches the training manifest. Target account and repository names are explicit; upload refuses existing repositories unless `--update` is specified.

## Browser verification

Opened the local app, visually checked dark-theme contrast and the classify/review interface, and exercised a real browser workflow:

1. Software example produced a SOFTWARE suggestion and an auto-accept route.
2. Ambiguous technical/business description produced FINANCE at approximately 0.367 and escalated with no final label.
3. Ordinary reviewer claim was rejected with “Escalations require a senior reviewer”.
4. Simulated senior claimed the item, supplied a reason, changed the label to SOFTWARE, and resolved it.
5. The visible queue showed `resolved`, `SOFTWARE`, `HUMAN`, revision 2.

The correction is a simulated demonstration, not an independently established ground-truth label. `review-proof.jpg` captures this verified flow. The final polished release was checked again: guided cases created three records; an ordinary-role denial preserved the queue; a senior claim and correction produced SOFTWARE/HUMAN at revision 2. The System tab rendered the diagram and offered its SVG download. The first in-app navigation required a reload; direct local HTTP returned 200. No startup-performance claim is made.

## Failed test, correction, retest

`notebook-routing-before-after.txt` preserves the earlier focused check of the original notebook's routing function: NaN incorrectly fell through to ESCALATE. The correction rejected six malformed values and retained five valid boundary outcomes. The delivered `review.route_confidence` contains the shared guard and the current suite reruns those edge cases. Original-notebook thresholds in that evidence are separate from this release's validation-selected 0.52 policy.

The project also fixes the original notebook's queue/final-result completion mismatch by storing status and final label on one authoritative row with atomic history. Rollback and human-override tests verify that behavior.

## Known validation limits

- No live Hugging Face upload or hosted Space build has been tested: no local authenticated Hugging Face session is available.
- Public identity selection simulates roles; it does not provide authentication or production RBAC.
- Temporary session SQLite files are not durable across cleanup or host restart. No SLA engine, notifications, reassignment, reopening, or automatic retraining exists.
- Results cover selected O*NET® tasks, not real user job descriptions. Test contains ten occupations, including one SOFTWARE occupation. No group-bootstrap uncertainty interval or external real-world accuracy study is supplied.
- No OTHER class is trained. Confidence cannot reliably detect unrelated work. Probabilities are uncalibrated.
- Gradio app-construction tests emit upstream ResourceWarnings about unclosed event loops; the checks pass. No failed assertion or runtime exception occurred in the verified browser flow other than the intended denied action.
- Test logs have local runtime path prefixes replaced with `<local-python-runtime>` before inclusion in a public package.

## Publish

Authenticate locally as PabloRod11, then follow `README.md` and run `publish.py`. Intended destinations: `PabloRod11/occupation-hitl-classifier` (model) and `PabloRod11/occupation-review-studio` (Gradio Space). Authentication or publication has not been fabricated, and no token belongs in this package.

## Review and design pass

A second three-agent pass reviewed model reliability, workflow correctness, and architecture/diagram design. The root integrated presentation changes and tested them in the browser. All 28 checks pass after the final code changes; `test-results.txt` is the full log.

Concrete corrections:

- The standalone model loader previously resolved the wrong default path. It now prefers adjacent model.json, with a project-layout fallback. `standalone-loader-retest.txt` reproduces the legacy path failure and records the passing correction. Both inference copies match.
- Model loading rejects invalid artifact configuration, vocabulary indexes, non-finite values, dimensions and thresholds before prediction. Independent sklearn parity checks cover held-out inputs and token edge cases.
- New concurrency tests use separate connections and actual competing threads; exactly one claim wins. Creation rollback and persisted UTC decision provenance are also checked.
- Expected review denials now warn without replacing queue/detail panels with error states. Invalid identities and missing revisions fail without mutation. The visible decision trail escapes untrusted text.
- Feedback CSV uses atomic replacement and guards formula-like cells. Guided examples exercise accepted and escalated paths without implying accuracy validation.

Presentation changes: compact header and visible five-tab navigation; neutral form labels and semantic theme tokens; guided cases; queue counts; role guidance; readable record summary and timeline; explicit refresh; measured evidence with weak-category caveats; accessible original SVG architecture/routing/state diagrams and full-size download. `ui.css` keeps presentation separate from workflow and inference.

All requested reference areas were inspected. `DESIGN_AND_ARCHITECTURE.md` cites the adopted ideas and deferred work. The supplied go-gorm/daisyui URL could not be retrieved; the separate official GORM and daisyUI repositories were inspected. The app retains Gradio and SQLite rather than adding a Go ORM, Tailwind build or .NET architecture template. No source from these references was installed or copied into the runtime.

Trained model JSON SHA256 and evaluation metrics remain unchanged. No model retraining, threshold tuning, stakeholder sign-off, or public publication occurred during this polish pass.
