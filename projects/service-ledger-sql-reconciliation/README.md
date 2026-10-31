---
title: ServiceLedger SQL Reconciliation
colorFrom: gray
colorTo: gray
sdk: static
app_file: index.html
pinned: false
short_description: SQL billing reconciliation with synthetic data and tests
---

# ServiceLedger — SQL reconciliation case study

A fictional billing and service-activation reconciliation with duplicate records, missing activations, mismatched charges, and conflicting statuses. Includes SQL, source evidence, business meaning, exception ownership, and 18 passing acceptance tests.

Open the **App** tab for the interactive case study.

[Download the complete runnable project](./sql-reconciliation-case-study.zip). Extract it and run `python3 run.py` inside `sql-reconciliation`. Requires Python 3.9+; no third-party packages.

The zip preserves all source directories and is the authoritative runnable project. The individual files in this Space support the static preview; do not run the test file from the flattened preview directory.

Entirely synthetic. No customer data or employer assignment is represented. Dollar findings are potential review amounts, not realized savings. No Power BI workbook is included.

Baseline: 16 exceptions across 15 of 21 service IDs; $115.00 potential overcharge, $50.01 potential underbilling, $290.00 known bills with unverified expectations, plus one service with unknown billing.
