---
title: Occupation Review Studio
emoji: 🔎
colorFrom: green
colorTo: gray
models:
- PabloRod11/occupation-hitl-classifier
sdk: static
app_file: index.html
pinned: false
license: mit
short_description: Browser-based occupation classification and human review
---

# Occupation Review Studio — free public browser edition

**Independent case study with simulated business requirements.** Built for PabloRod11. No stakeholder interviews or business sign-off are claimed.

A Static Space runs the existing trained TF-IDF/logistic-regression weights directly in JavaScript. No inference API, token, paid compute, server Python, or Gradio runtime is required. Model and evaluation JSON are bundled, so inference remains on the visitor's device after loading.

The review demo uses per-tab browser sessionStorage. It has simulated roles and a reasoned decision trail, but no authenticated users, SQLite server, shared queue, server-enforced permissions, multi-user transaction guarantees, durable storage, SLA alerts, or automatic retraining. Browser restore settings can retain tab sessions; use the explicit clear control when finished. Use fictional, non-sensitive text.

The Python/SQLite companion, BSA requirements, design review and tests are included in source-package.zip. Its architecture diagram is explicitly labeled as the companion architecture rather than the hosted storage design.

## Model

[PabloRod11/occupation-hitl-classifier](https://huggingface.co/PabloRod11/occupation-hitl-classifier), model version onet31-tfidf-8cc1b32a235b. The same frozen weights and thresholds are used. Held-out occupation test: 80.35% accuracy, macro F1 0.7854; auto-accept coverage 77/173 with 76/77 correct among accepted. Probabilities are uncalibrated; the five-category taxonomy covers selected occupations, not all job descriptions. Software recall is 53.85% on 13 tasks from one occupation.

The browser implementation is tested against Python probabilities on all validation/test inputs and Unicode/token edge cases. Inspect static-test-results.txt and parity-fixtures.json for the recorded evidence. Engine tests cover routing, guards, human overrides, role denial, stale revisions, immutable completion, and failed-storage rollback.

## Reproduce browser tests

`node test-engine.mjs` and `node --test test-startup.mjs` from this directory. Startup regression checks cover corrupt JSON, invalid stored structure, blocked storage reads, healthy sessions, and model-load failure. For local serving, use `python -m http.server 8000` and open localhost:8000. No npm install or build step is needed.

## Attribution and licenses

Includes information from the O*NET® 31.0 Database by USDOL/ETA, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). This project selects occupations, maps five project labels, removes repeated normalized tasks, and creates grouped splits. USDOL/ETA has not approved, endorsed, or tested these modifications. O*NET® is a trademark of USDOL/ETA. See ATTRIBUTION.txt and the model repository. Original app code is MIT; model/data attribution remains separate.

Inspired by Pablo Rodriguez's [HITL Review Pipeline notebook](https://github.com/pablorod11/ML-AI-Projects/blob/main/HITL_Review_Pipeline.ipynb). This is a case-study prototype, not an operational review service or hiring system.
