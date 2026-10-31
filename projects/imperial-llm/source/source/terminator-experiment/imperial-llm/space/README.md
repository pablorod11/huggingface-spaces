---
title: Imperial LLM
emoji: 🏛️
colorFrom: gray
colorTo: green
sdk: static
app_file: index.html
pinned: false
license: mit
short_description: Experimental character model; grammar remains unreliable.
---

# Imperial LLM: experimental model 005

**Experimental release: all 12 reviewed continuations failed the grammar/coherence screen.** Published as an experimental research checkpoint. This release does not pass the project's story-quality gate and is not a reliable assistant or storyteller.

Model 005 is a 110,387-parameter causal character Transformer with width 64, two blocks, four heads, context 64 and a 51-character vocabulary. Generation runs locally in the browser. It uses no external pretrained foundation-model weights, instruction tuning or retrieval.

## Measured change

The comparison baseline is the strongest archived, unpublished width 64 model, selected at step 14000 of a 14400-update training run. Both new policies start from those weights with fresh AdamW optimizers and execute 2400 additional updates. Cosine learning rate0.0003→0.00003 is selected by minimum validation loss, including step 0, over constant 0.001. Cosine step 2400 wins. This compares learning-rate policies differing in scale and shape, not schedule shape alone.

Validation character cross-entropy falls from 1.183765 to 1.130293. On the **previously observed regression test**, loss falls from 1.188995 to 1.137958, a 4.29% reduction. These are nats per normalized predicted character. The test has128 stories and four fixed64-character windows per story,32768 predictions; windows can overlap. This is reused regression evidence, not a fresh held-out generalization claim. Validation has also informed earlier experiments. The former live model 004 has 30,643 parameters and a different training history; it is not the matched baseline for these percentages.

All 12 cosine continuations contain broken grammar and fail sustained prompt-related coherence; five contain clear malformed words. The screen covers four frozen prompts ×three seeds, temperature 0.7, top 20 and 160 generated characters. It is unblinded agent screening, not a human study or standardized grammar score. Lower character loss does not establish fluency, reasoning, instruction following or broad reliability.

## Data, reproducibility and verification

Training uses 4096 normalized whole TinyStories stories and 128 validation stories, with 51-character vocabulary and story-contained windows. TinyStories V2 GPT4 is by Ronen Eldan and Yuanzhi Li, pinned to revision `f54c09fd23315a6f9c86f9dc80f725de7d8f9c64`, under [CDLA-Sharing-1.0](https://cdla.dev/sharing-1-0/). Corpus manifests retain source URLs, membership hashes and modification notices. This run retains legacy normalization, including removal of unsupported punctuation; do not describe it as the later terminator-repair corpus. Source code is MIT licensed; that does not replace the corpus license.

The supported Linux run uses CPU PyTorch 2.14.1+cpu, one thread and deterministic operations. The 38 focused Python tests and both browser export suites passed. Python/JavaScript numerical parity, model hashes, input validation, seeded generation and context cropping were checked. These checks establish implementation consistency, not story quality or universal safety. Python checkpoint loading requires stable PyTorch ≥2.6 with restricted loading and current security fixes; the old local IntelMac Torch 2.2.2 runtime must not deserialize checkpoints.

The selected checkpoint stores weights and primitive metadata, not optimizer/RNG state. The refinement resets AdamW; it is not an exact continuation of the archived optimizer trajectory. Source.zip preserves the old baseline, new source and experiment artifacts. See MODEL_CARD.md and REPRODUCE.md. No training curve is invented; recorded history is validation loss.

Rollback target: Hugging Face Space revision `3185cd49f7abccc7ad2b30c4b73b04672415da76` (previous model 004 release).


## Browser runtime update: KV cache and final-block optimization

The model005 weights and training record are unchanged. Each generation owns a Float64 key/value cache, reused only for exact prefix extension. Sliding windows rebuild because learned positions and causal history change. The final Transformer block evaluates only the final query and MLP output while retaining the required keys/values for all positions.

On one local Node CPU host, three timed rounds per case gave a default-prompt median of13.634s before and5.691s after both optimizations (2.40×). A full64-character prompt improved from16.101s to9.355s (1.72×), attributable to final-block optimization rather than sustained KV reuse. These are preliminary CPU measurements, not browser end-to-end guarantees. Exact logits, generated text and streaming messages matched the reference in the recorded tests. See INFERENCE_CHECKS.json and INFERENCE_BENCHMARK.json.

This improves inference speed, not grammar or reasoning. The failed0/12 prose-quality review still applies. SPIN training was not performed. Runtime rollback revision: fa0102895965dfd2e5dbb492bdac7d0f732a55b4.
