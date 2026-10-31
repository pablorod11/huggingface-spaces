## A business process, with a model inside it

**Independent case study with simulated business requirements.** Prepared for PabloRod11. No stakeholder interviews, client deployment, business approval, or business sign-off are claimed.

### Problem and intended users

A hypothetical workforce analytics team assigns short descriptions of work to five broad categories. A model can suggest a category, but ambiguous wording needs review. The goal is to separate a prediction from the authoritative final label and make exceptions visible.

An ordinary reviewer handles routine work. A senior adjudicator handles escalations and out-of-scope descriptions. An audit reader inspects decisions. These are simulated personas. The demo role selector exercises access rules; it does not authenticate a person. No hiring, eligibility, or employee scoring decisions are supported.

### Scope and decisions

The original [notebook](https://github.com/pablorod11/ML-AI-Projects/blob/main/HITL_Review_Pipeline.ipynb) by Pablo Rodriguez supplies the project concept. This implementation replaces its synthetic phrase dataset with selected O*NET® 31.0 task statements, separates occupations across train/validation/test, trains an explainable TF-IDF/logistic-regression baseline, and implements consistent review state in SQLite.

The five project categories are SOFTWARE, FINANCE, HEALTHCARE, EDUCATION, and TRADES. Explicit occupation-code allowlists define their scope; other occupations are excluded. This mapping is a simulated business decision, not an official O*NET® classification. A classifier must still choose one of these labels for unrelated text, so an expert can close an item out of scope.

### State transitions and permissions

Inference creates a resolved/model record only when the frozen auto-accept rule passes. Otherwise the record is pending or escalated, with an empty final label.

`pending → in_review → resolved`

`pending → in_review → escalated → in_review → resolved | out_of_scope`

Escalated work requires a senior identity. Ordinary reviewers can claim routine work, resolve it, or escalate it with a reason. Only a senior can close an item out of scope. Audit readers cannot change records. Only the owner of a claimed record can decide it. Completed records are immutable in this demo. Repeated or stale submissions fail and must refresh; the API does not promise idempotent retries or reopening.

The same authoritative record contains review state and final label. History is committed in the same transaction. An audit-write failure rolls back the decision. SQLite history is inspectable, not tamper-proof.

### Requirements → acceptance criteria → runnable checks

- **R01 / Routing.** AC: finite confidence uses the frozen thresholds; null auto threshold disables acceptance. Exact boundaries route consistently. Tests: `ReviewTests.test_routing_and_invalid_input` and `ReviewTests.test_disabled_auto_accept_and_threshold_validation`.
- **R02 / Withhold unresolved labels.** AC: pending, escalated, and claimed work has no final label; a human decision overrides the suggestion. Test: `ReviewTests.test_correction_history_and_immutable_resolution`.
- **R03 / Permissions and ownership.** AC: audit readers cannot write; ordinary reviewers cannot resolve escalations; decisions require a claimed item and its owner. Test: `ReviewTests.test_manual_escalation_and_claim_owner` and `ReviewTests.test_escalation_authorization_and_out_of_scope`.
- **R04 / Concurrency.** AC: a stale revision cannot overwrite a completed or newly claimed record. Test: `ReviewTests.test_stale_competing_writer_and_persistence`.
- **R05 / Transactional provenance.** AC: history includes identity, role, UTC timestamp, reason, model version, and record snapshot; audit failure commits neither history nor decision. Test: `ReviewTests.test_audit_write_failure_rolls_back_resolution`.
- **R06 / Persistence and isolation.** AC: state reloads from the same SQLite file; separate session files do not share records. Tests: `ReviewTests.test_stale_competing_writer_and_persistence` and app integration checks.
- **R07 / Input exceptions.** AC: blank text and malformed confidence fail; zero-vocabulary text escalates with no final label. Tests: `ReviewTests.test_routing_and_invalid_input`, `ReviewTests.test_manual_escalation_and_claim_owner`, and `IntegrationTests.test_model_predictions_and_input_guards`. Model input is limited to 10,000 characters.
- **R08 / Evaluation integrity.** AC: occupation groups and normalized exact text are disjoint across splits; vocabulary fits training only; threshold selection uses validation only. Checks: `prepare_data.py --self-check`, training assertions, and integration checks.
- **R09 / Artifact parity.** AC: exported JSON inference reproduces sklearn probabilities within 1e-10 on validation/test and three challenge strings. Check: `train.py`; measured error is saved in `model/metrics.json`.
- **R10 / Feedback.** AC: export contains completed human decisions and provenance only; no export automatically retrains or deploys a model. Check: app integration tests.

- **R11 / Downloaded model reliability.** AC: the loader finds an adjacent model.json in the standalone model repository and rejects malformed dimensions, non-finite weights, unsupported vectorizer settings, invalid vocabulary indexes, and invalid thresholds before serving predictions. Tests: `InferenceTests.test_model_repository_standalone_default_loader` and `InferenceTests.test_corrupt_artifacts_fail_before_prediction`.
- **R12 / Review usability.** AC: guided cases create three inspectable records; role denials leave existing UI values and state intact; untrusted text is escaped in the visible trail. Tests: `IntegrationTests.test_guided_cases_and_presentation`, `IntegrationTests.test_expected_ui_denial_preserves_existing_outputs`, and `IntegrationTests.test_rendered_record_escapes_untrusted_content`.
- **R13 / Inspectable architecture.** AC: the diagram describes actual inference, routing, state and transaction boundaries; future identity, storage and SLA work is labeled proposed. Checks: SVG XML/accessibility tests and browser inspection; source-backed rationale in `DESIGN_AND_ARCHITECTURE.md`.

Test method names are verified against the delivered suite in the release report. Proposed future requirements below are deliberately excluded from implemented acceptance.

### Failed test, correction, and retest

The original notebook's routing function accepted NaN by falling through to ESCALATE. Under the proposed finite-input requirement, that is a failed test: expected ValueError, actual ESCALATE. The earlier case-study exercise recorded that behavior and demonstrated a guard.

This implementation puts that guard in the shared routing function. The runnable test checks NaN, infinity, out-of-range values, None, and booleans, then reruns valid routing boundaries. The test log records the delivered test run. This is input-validation repair, not evidence that model accuracy improved.

A packaging regression found during the later review also provides a concrete retest: the standalone model default loader looked below a nonexistent model/ directory. It now finds the adjacent artifact; `standalone-loader-retest.txt` records the failing legacy path and passing load, backed by `InferenceTests.test_model_repository_standalone_default_loader`.

A second correction is workflow consistency: the notebook left queue review_status at PENDING after a human decision. This version uses one authoritative SQLite row for completion and final labels and commits history atomically; the human-override and rollback tests exercise that change.

### Exception paths and escalation policy

Low confidence or zero known vocabulary escalates. Ordinary reviewers can also escalate ambiguous or conflicting evidence. Missing input and invalid decisions are rejected without mutation. Unrelated work may be closed out of scope by a senior, retaining no final category. Stale writes fail and refresh; storage errors roll back and surface an error. Completed decisions cannot be silently edited.

A proposed operations policy would alert on routine work older than one business day and escalations older than four business hours. No SLA timer, holiday calendar, notification delivery, reassignment, or production identity provider is implemented. These need actual operational users and workload evidence before acceptance.

### Three-minute demonstration

1. Click **Add guided demo cases** on Classify, then open Review. Inspect the accepted software task and the two escalations. These are fictional workflow examples, not an accuracy benchmark.
2. Select an escalation and try to claim it as Ordinary reviewer. A warning explains the restriction while preserving the queue and selected record. Switch to Senior adjudicator.
3. Claim it, choose a category, and give a reason. Resolve and inspect the human final label and readable decision trail. Use Refresh record before retrying stale work.
4. Enter unfamiliar or ambiguous work. Try an ordinary reviewer on an escalation, then switch to the simulated senior identity and close it out of scope.
5. Export completed feedback. Explain that it is a dataset candidate, not an automatically improved model.
6. Open Evidence to explain grouped evaluation and limitations, then System to trace the running design and distinguish proposed production work.

### Limitations and next decision

O*NET® task statements are not real-user job descriptions. Only selected occupations and five coarse categories are supported. Exact duplicate removal does not eliminate semantic similarity. Software has few occupation groups, so results may be sensitive to the split. Probabilities are uncalibrated; validation acceptance precision is not a future guarantee. The Python/SQLite companion uses temporary per-session SQLite files and simulated identities. The hosted static browser edition uses per-tab sessionStorage and simulated roles, without authenticated users, shared queues, or server-enforced permissions. Both are portfolio demonstrations, not operational review services.

A credible next pilot would define the taxonomy with real users, independently label representative inputs, compare model suggestions with reviewer agreement and effort, and validate authentication, persistence, retention, and operational escalation. This project does not claim those activities occurred.
