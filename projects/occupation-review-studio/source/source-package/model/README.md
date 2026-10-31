---
language: en
license: cc-by-4.0
library_name: sklearn
pipeline_tag: text-classification
tags:
- occupation-classification
- human-in-the-loop
- business-systems-analysis
- tfidf
- logistic-regression
- onet
model-index:
- name: occupation-hitl-classifier
  results: []
---

# Occupation HITL classifier

**Independent case study with simulated business requirements.** Prepared for **PabloRod11**. No stakeholder interviews, business sign-off, production deployment, or measured business savings are claimed.

## Model and intended use

An explainable English task-text classifier: TF-IDF word unigrams/bigrams plus multinomial logistic regression. It suggests one of five project categories: SOFTWARE, FINANCE, HEALTHCARE, EDUCATION, TRADES. A separate demonstration routes uncertainty to human review and preserves final labels and corrections.

Version: `onet31-tfidf-8cc1b32a235b`. Export format: JSON vocabulary, IDF values, coefficients, intercepts, classes, and frozen thresholds. Inference needs only Python's standard library; the JSON contains no executable pickle payload. This custom artifact does not implement Transformers AutoModel/pipeline loading or imply hosted Inference Provider support.

Use for education, BSA workflow demonstration, and baseline experimentation. Do not use for hiring, ranking people, eligibility, clinical decisions, or comprehensive occupation coding.

## Training data and taxonomy

Selected O*NET® 31.0 Task Statements, joined to Occupation Data. The official source contains 18,838 task statements. The project excludes 17,441 rows outside its explicit 55-code occupation mapping and removes all 392 rows in repeated normalized-text clusters, leaving 1,005 tasks.

The five labels are project design choices, not an official O*NET taxonomy. `provenance.json` lists the exact code-to-title mapping, source URLs/hashes, exclusions, task IDs, normalization, and splits.

Split by occupation code, approximately 60/20/20 within each class: training 689 tasks/35 occupations, validation 143/10, final test 173/10. No occupation code or normalized exact task text crosses splits. Vectorizer vocabulary is fitted on training only. Six software occupations are selected, leaving just one software occupation in validation and one in test. Related wording and semantic duplicates can still remain.

## Measured results

On the final test set of 173 tasks from ten held-out occupations:

- Accuracy: **80.35%** (139/173).
- Macro F1: **0.7854**.
- Balanced accuracy (macro recall): **76.20%**.
- Multiclass log loss: **0.7898**.
- Auto-accepted: **77/173 (44.51%)**.
- Correct among auto-accepted: **76/77 (98.70%)**.
- Escalated: **89/173**; ordinary review: **7/173**.

Full per-class precision/recall/F1/support and confusion matrices are in `metrics.json`. SOFTWARE recall is 53.85% on 13 tasks from one occupation; aggregate performance must not obscure that weakness.

## Routing policy and uncertainty

Frozen thresholds: auto-accept ≥0.52; ordinary review ≥0.50 and <0.52; escalate <0.50. Zero-vocabulary inputs always escalate. The auto threshold was selected from 0.50–0.99 using validation only: lowest threshold with at least 20 accepted cases and empirical accepted accuracy ≥95%. On validation it accepted **66/143**, with **63/66 (95.45%)** correct. No threshold is tuned to final-test results.

These are empirical task-level measurements, not a future 95% guarantee. Probabilities are **uncalibrated**. There are only ten held-out occupation groups, and no group-bootstrap interval is supplied. Task-level counts overstate independent evidence because tasks within an occupation are related. A probability threshold cannot reliably detect unrelated or out-of-taxonomy inputs.

The prototype originally used 0.80 auto-accept on synthetic phrases. This trained release uses a distinct validation-selected policy; the earlier case study's thresholds and saved metrics do not describe this artifact.

## Load and predict

Download `model.json` and `inference.py` into the same directory:

```python
from inference import Classifier
model = Classifier('model.json')
result = model.predict('Develop and test software applications.')
print(result['prediction'], result['confidence'], result['route'])
```

Input must be a nonblank string of at most 10,000 characters. Unseen text can still receive an incorrect supported label. The caller must preserve a distinction between suggestion and final human decision.

JSON inference probabilities match sklearn to maximum absolute error **2.78e-16** across **319** parity samples (all validation/test texts plus three implementation probes), within the 1e-10 tolerance. These probes check export correctness; they are not an independent accuracy benchmark.

## Reproduction

The companion Space/source package includes `prepare_data.py`, `train.py`, pinned requirements, splits, and tests. Train with Python 3.12.14, scikit-learn 1.9.1, NumPy 2.5.4, SciPy 1.18.1; seed 42. Logistic regression C=4.0, max_iter=2000; up to 20,000 TF-IDF features; sublinear term frequency; L2 normalization.

`training_metadata.json` records source-split and model hashes. Version identity incorporates model content, data hashes, and training/threshold configuration. Evaluation is a single grouped holdout; no cross-validation or transformer comparison is claimed.

## Limitations

O*NET® tasks are not real job advertisements or real-user inputs. The mapping covers selected occupations only; no OTHER class is trained. Labels can conflate distinct kinds of work. Training classes are uneven (46 education tasks versus 207 trades tasks). The small number of held-out occupations limits generalization claims. Text can include misleading domain terms and the classifier has no contextual world understanding. Public demo roles are simulated; authentication, SLA alerts, durable operational storage, real stakeholder validation, and automatic retraining are outside scope.

## Attribution and license

Includes information from the O*NET® 31.0 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). O*NET® is a trademark of USDOL/ETA. This project filters occupations, maps them to five simulated labels, removes duplicate task text and assigns grouped splits. USDOL/ETA has not approved, endorsed, or tested these modifications. Source license: https://www.onetcenter.org/license_db.html

Source data: [O*NET® database](https://www.onetcenter.org/database.html). License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The derived data and supplied model are distributed with the same attribution license; original project code is MIT in the companion package. Inspired by Pablo Rodriguez's [HITL Review Pipeline notebook](https://github.com/pablorod11/ML-AI-Projects/blob/main/HITL_Review_Pipeline.ipynb). No endorsement of this project by USDOL/ETA is implied.
