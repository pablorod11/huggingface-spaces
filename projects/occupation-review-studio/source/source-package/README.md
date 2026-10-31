---
title: Occupation Review Studio
emoji: 🔎
colorFrom: green
colorTo: gray
sdk: gradio
sdk_version: 6.30.0
python_version: '3.12'
app_file: app.py
pinned: false
license: mit
short_description: Explainable occupation classification with human review
---

# Occupation Review Studio

**Independent case study with simulated business requirements.** A BSA portfolio project for **PabloRod11**: a real trained model, a review workflow, and acceptance tests you can inspect.

The app classifies descriptions into five selected occupational categories, routes uncertainty for review, and preserves human decisions separately from predictions. SQLite commits each state change with its history. Session files are temporary; identities are simulated, not authenticated.

## Run locally

Use Python 3.12:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:7860. Try **Add guided demo cases**, then open **Review** for a quick walkthrough. The trained model is included. Inference uses only Python's standard library; Gradio supplies the interface.

## Reproduce training and validation

```bash
pip install -r requirements-train.txt
python prepare_data.py --output-dir data
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python train.py
python -m unittest discover -v
python prepare_data.py --self-check
```

Data preparation downloads versioned official O*NET® CSVs. For cached inputs use `--offline`. Training fits vocabulary on train only, selects the acceptance threshold on validation only, then evaluates the frozen test. `model/metrics.json` and `model/training_metadata.json` contain measured results, hashes, and versions. Do not repeatedly tune using test results.

The split is by exact occupation code. All repeated normalized task text is removed before splitting. The training set has 689 tasks across 35 occupations; validation has 143/10; test has 173/10. Only six software occupations are selected, so that category has very limited held-out group diversity.

## Review rules

- A model-accepted item is resolved with MODEL provenance.
- Human-routed records have no final label until an authorized simulated role claims and resolves them.
- Low confidence and zero known vocabulary escalate. Senior review is required.
- Owners must give a reason to resolve, escalate, or close out of scope.
- Stale revisions fail. Completed decisions are immutable. There is no reopen or idempotency protocol.
- History and decision writes commit together. Feedback export includes only resolved human decisions; no automatic retraining occurs.

The role dropdown is a teaching tool. Public users can select any role. Never treat it as a production identity boundary. Per-session SQLite files are deleted after cleanup or host restart; this is not a durable operational service.

## Publish under PabloRod11

Prepared repository names:

- Model: `PabloRod11/occupation-hitl-classifier`
- Space: `PabloRod11/occupation-review-studio`

These are intended names, not a claim that publication occurred. Authenticate from your terminal, then run the uploader:

```bash
pip install huggingface_hub==2.2.0
hf auth login
python publish.py --dry-run
python publish.py
```

`publish.py` verifies the account is PabloRod11. By default it refuses to overwrite an existing repository; use `--update` only when intentionally replacing a reviewed release. It publishes the model directory and this Space directory, excluding raw source caches, session files, and Python caches. No paid hardware is requested. Read the model card and release report before uploading.

## Inspectable deliverables

- `BSA_CASE_STUDY.md`: users, scope, process states, exception rules, numbered requirements, acceptance tests, demonstration, and limitations.
- `model/README.md`: model card, measured evaluation, appropriate use, and limitations.
- `data/provenance.json`: official URLs, source and split hashes, mapping, exclusions, task IDs, and license attribution.
- `test_review.py` and `test_app.py`: workflow and integration acceptance checks.
- `RELEASE_REPORT.md`: local execution evidence and known gaps.
- `DESIGN_AND_ARCHITECTURE.md` and `diagrams.svg`: implemented flow, state/exception design, reference review, and proposed production boundaries.
- `ui.css`: semantic interface styling without adding a separate frontend framework.

## Source and attribution

Inspired by Pablo Rodriguez's [HITL Review Pipeline notebook](https://github.com/pablorod11/ML-AI-Projects/blob/main/HITL_Review_Pipeline.ipynb). The implementation and training data preparation here are newly written for this case study; they do not imply the notebook was deployed or signed off.

Includes information from the O*NET® 31.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). O*NET® is a trademark of USDOL/ETA. This project filters occupations, maps them to five simulated labels, removes repeated normalized task text, and assigns grouped splits. USDOL/ETA has not approved, endorsed, or tested these modifications. See [O*NET's license](https://www.onetcenter.org/license_db.html) and `data/ATTRIBUTION.txt`.

Code: MIT (`LICENSE`). O*NET-derived data and the supplied model artifact: CC BY 4.0 (`model/LICENSE`). Source attribution remains applicable separately from the code license.

## Boundaries

This is a closed-set task-text classifier, not a foundation model or LLM. It is not intended for hiring, ranking people, eligibility, clinical decisions, or comprehensive occupation coding. Task statements differ from real job ads. Categories cover only selected occupations. Confidence is uncalibrated; accepted-only precision has finite support and does not guarantee future accuracy. No stakeholder interviews, business sign-off, measured business savings, production authentication, SLA notifications, or automatic retraining are claimed.
