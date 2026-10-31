# Reproduce the study

Node.js only; no package installation. From this folder:

```
node fixed-blend-study.cjs development
node study.cjs development
node study.cjs confirmation
node ecb-evaluate.cjs
```

These scripts overwrite their own result JSON files. Read STUDY-PLAN.md and REPORT.md first. model-under-test.js and labs-under-test.js pin the tested source; production code may later add support metadata without changing probabilities. The ECB CSV is a dated public snapshot, not an automatically refreshed market feed. Its source and hashes are recorded in ecb-source.json.

No confirmation run is needed for the rejected fixed blend. No model training defaults were promoted from these results. The online-study JSON calls its second challenger `online`; development.json records the first challenger as `blend`.
