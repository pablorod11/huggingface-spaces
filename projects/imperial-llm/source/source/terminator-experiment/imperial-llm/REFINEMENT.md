# Reproducible LLM refinement stages

This project now has a bounded CPU lifecycle experiment. Existing model003 remains the public release. All new experiment results use repeatedly selected validation data; they are smoke evidence and do not justify promotion.

## Data

The executed experiment verifies manifest/file hashes and reconstructs whole stories against their recorded hashes, including embedded paragraph boundaries. Of512 existing training stories,384 are assigned to scratch pretraining and128 to continued adaptation by deterministic whole-story hash ordering. Existing64 validation stories supply identical fixed windows for every run. Test text is not opened or scored. Exact train/validation overlap is rejected. Near-duplicate screening of this original corpus remains incomplete; new web candidates have the heuristic deduplication described in WEB_CORPUS.md and require complete exclusions supplied by the operator.

Code sources and generated code reviews are not story-training examples. The model's fixed51-character alphabet cannot represent ordinary code accurately. A code-model project would need a licensed code corpus, an appropriate tokenizer/architecture and separate evaluation; silently normalizing code into this alphabet would destroy it.

## Pretraining and compute scaling

`scripts/refinement_experiment.py` initializes four Transformers from scratch with seed1729: widths16/32, each with40/80 optimizer steps,2 blocks,4 heads,32-character context, batch8. Each independent run uses the same validation token windows and comparable seeded training draws. It records initial, periodic and selected validation loss, executed/selected steps, actual parameter counts, optimizer-token counts, approximate6NT training FLOPs, CPU runtime, optimizer settings, source/data hashes and checkpoint hashes.

This is a2-by-2 compute sweep. It does not estimate a reliable scaling exponent or compute-optimal model/data ratio: there are only four correlated tiny runs, one seed, repeated validation selection, a fixed small dataset and CPU timing noise. A real scaling study needs multiple seeds, broader budgets and data sizes, uncertainty estimates, fixed evaluation/tokenization and a compute budget agreed in advance. FLOPs here are a rough parameter-token proxy, not measured hardware FLOPs.

## Post-training

The best validation-selected scratch model undergoes40 more next-character training steps on the128 disjoint same-domain training stories. The initial adaptation state participates in checkpoint selection, so a worse adaptation is not retained. This is continued corpus adaptation; no instruction tuning, preference optimization, reward model or RLHF was performed. TinyStories supplies neither instruction-response nor human preference labels. Those stages require fit-for-purpose licensed labels, an adequate tokenizer/context and task-specific evaluation before implementation.

## Evaluation

Four scratch runs produced selected validation CE: width16/40steps3.11665, width16/80steps2.86732, width32/40steps2.85678, width32/80steps2.60734. Adaptation selected CE2.53375 from baseline2.60734 (about2.82% lower on the same fixed validation windows). These models have context32 and less training than public003; their numbers are not a like-for-like improvement over the deployed context64 model. No public-model improvement is claimed.

All five saved checkpoints passed exact PyTorch reload-logit equality. Every run's exact values and method are in `experiments/lifecycle-smoke.json`; large local checkpoints remain in `/Users/sanjusrikanth/Documents/Codex/2026-10-19/as/work/refinement-run`. Repeated selection on validation means a new unseen whole-story holdout is required for a future final quality claim. The already observed model003 test is regression evidence only for iterative refinement.

## Systems and delivery

Current Transformer inference retains browser workers, immediate cancellation, checksums and Python/JavaScript parity gates. No experimental checkpoint was exported to the browser or promoted. A candidate of a different context/size needs its own export schema checks and Python/JS parity fixtures before serving. Broad upstream checks remain constrained by this host's legacy PyTorch2.2.2 runtime.

ECC roles: Berthier/coordinator scoped the work; Davout implemented and executed the experiment; Soult verified external sources; Lannes independently reviewed trust boundaries and evaluation. The coordinator maintained verification and delivery documentation. Roles worked in bounded waves rather than pretending six agents were simultaneously active.

## Reproduce

From the project root, choose an output directory that does not exist:

```sh
/Users/sanjusrikanth/Documents/Codex/2026-10-19/as/work/llm-venv/bin/python scripts/refinement_experiment.py --output /Users/sanjusrikanth/Documents/Codex/2026-10-19/as/work/refinement-run-repeat
python3 -m unittest tests.test_refinement_experiment tests.test_web_corpus -v
node space/test_inference.cjs
node space/test_generation.cjs
```

The run is offline using the existing normalized corpus. It refuses output at or beneath the published `space/` path and refuses to overwrite prior output. Stage failures can leave a partial new experiment directory for inspection. There is no automatic promotion, API invocation or unbounded training loop.
