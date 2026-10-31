# Reproduce experimental model 005

Use a supported Linux host with Python 3.12, Node 24 and a maintained patched CPU PyTorch runtime. The recorded run used PyTorch 2.14.1+cpu and the exact package snapshot in requirements-linux-verified.txt. That snapshot records versions; it is not a wheel-hashed supply-chain lock. The legacy IntelMac Torch 2.2.2 environment cannot safely reload project checkpoints and must not bypass the loader guard.

Extract source.zip and enter its imperial-llm project directory. Keep the archived baseline and experiment evidence unchanged. The package contains original corpus notices, the archived wide baseline and new source/artifacts; do not mix the terminator-repair corpus into this reproduction.

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install torch==2.14.1+cpu --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python -m pip install -r requirements-linux-verified.txt
.venv/bin/python -m unittest discover -s scripts -p test_late_refinement.py -v
.venv/bin/python scripts/prepare_refinement_inputs.py
.venv/bin/python scripts/late_refinement.py --root . --output experiments/refinement-new
node experiments/refinement-new/constant/test_inference.cjs
node experiments/refinement-new/constant/test_generation.cjs
node experiments/refinement-new/cosine/test_inference.cjs
node experiments/refinement-new/cosine/test_generation.cjs
```

Choose a new output directory; the runner refuses to overwrite existing evidence. Preparation reconstructs the recorded baseline inputs; it does not authorize publishing. Check the preserved workflow for the additional focused checkpoint/security/resume and wide-budget tests used by the recorded run. Preserve the exact installed environment, logs, protocol and hashes alongside new results.

Both policies start from the same archived selected step 14000 weights, with fresh AdamW state. Each executes 2400 updates, batch 16, context 64, seed 1729, clip 1 and default weight_decay 0.01. Cosine 0.0003→0.00003 and constant 0.001 are compared. Checkpoints and policy are selected only by reused validation CE, checked every 200 updates, including step 0. The recorded cosine candidate selects step 2400. Saved weights lack optimizer/RNG state; this is not an exact optimizer continuation.

The existing 128-story test is already observed. Reproduction can verify regression measurements; it cannot make this test fresh or establish new generalization. Keep frozen prompt/seed outputs for all models and inspect full text. The recorded candidate's 0/12 grammar/coherence passes remain a failed quality gate despite lower CE. Publication requires explicit authorization; these commands only train and verify.

Dataset: modified TinyStories V2 GPT4, Ronen Eldan and Yuanzhi Li, revision `f54c09fd23315a6f9c86f9dc80f725de7d8f9c64`, [CDLA-Sharing-1.0](https://cdla.dev/sharing-1-0/). Preserve membership/provenance manifests and modification notices. Rollback Space revision: `3185cd49f7abccc7ad2b30c4b73b04672415da76`.
