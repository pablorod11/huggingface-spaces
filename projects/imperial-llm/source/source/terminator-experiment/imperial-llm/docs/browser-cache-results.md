# Imperial model005: exact inference optimization candidate

KV caching and final-block last-position evaluation are implemented and validated locally. Model weights, checkpoint, architecture, training record and sampling are unchanged. This candidate has not been published; Hugging Face revision fa0102895965dfd2e5dbb492bdac7d0f732a55b4 remains the baseline.

| Scenario | Published runtime | Final block only | Final block + KV | Combined speedup |
|---|---:|---:|---:|---:|
| 1-character prompt, 64 new characters | 5.143s | 2.616s | 0.265s | 19.38× |
| Default 10-character prompt, 128 new characters | 13.634s | 8.182s | 5.691s | 2.40× |
| 64-character prompt, 128 new characters | 16.101s | 9.951s | 9.355s | 1.72× |

These are native Node CPU generation medians from three timed rounds with rotated method order, after a full warmup generation per method/scenario. There is also an untimed reference generation. Timing includes model validation and generation, and excludes browser/worker startup and UI message transport. All measured outputs and final logits match exactly. The one-character case is a favorable cache case, not the default workload. One host, one timing seed and three rounds support a preliminary benchmark, not a browser latency guarantee. Raw samples, CPU/runtime and method are in benchmark.json.

The default-prompt comparison separates the added benefit of caching from final-block optimization. With a full 64-character prompt, every step shifts the window and no KV prefix can be reused: any speedup there comes from final-block optimization and timing variation, not sustained cache reuse. Do not describe the combined speedup as a KV-only result.

Each generation request owns an independent decoder. It stores per-layer/head keys and values in Float64 arrays while a context extends the exact existing prefix. Float64 retains JavaScript Number precision. At a crop, replacement or mutation, it rebuilds the window. Learned absolute positions and dropped causal history make simple eviction incorrect. Full windows skip unnecessary cache allocation. Repeated identical contexts reuse logits; caller-owned IDs and returned logits cannot mutate the retained snapshots. The maximum numeric K/V payload is 128 KiB at 64 positions; typed-array/container overhead is additional. Model weights must remain immutable for the decoder's lifetime, as they do in the generation worker.

During a full forward pass, preceding blocks still compute every position. The final block computes all required keys/values, but only the last query, attention result and MLP output. The language-model head already consumed only the last position. Incremental decoding computes one new row per block. Input checks, RNG, top-k filtering, progress/done messages and worker termination remain in place.

Verification:

- The new test first failed because createDecoder was missing, before implementation.
- The final suite passes 109 main strict reference/optimized/cached logit cases, additional cache-path/bound controls and four seeded worker cases. Tests require actual incremental reuse, rebuilds at shifts/replacements/mutations, independent decoders, fresh returned arrays and recovery after invalid inputs. Worker cases compare complete text, final logits and all progress/done messages to the unchanged published runtime.
- Existing Python-export checksum/parity cases pass with the same maximum absolute error 0.000002560419, below 0.0001. The worker regression checks cover valid/invalid requests, deterministic output, streaming and long-history cropping.
- Local CUA browser checks confirm checksum verification, complete 64-character generation, cancellation with retained partial output/restored controls, and unsupported-character error/focus. Browser timings observed during other tests were not used as benchmark measurements.
- model.json, checkpoint.pt and training.json are byte-identical to the published model005 release. No PyTorch checkpoint was deserialized on this Intel Mac.

Files: space/ is a local static preview; changes.patch is the two-file runtime patch; test_cache.cjs and benchmark.cjs are inspectable checks. space/source.zip preserves the existing licensed project/data/security controls and adds the optimized runtime, original reference runtime, tests and benchmark evidence. It contains no environments, credentials or Git history.

After extracting source.zip, enter work/terminator-experiment/imperial-llm and run:

```sh
node tests/browser-cache/test_cache.cjs
node tests/browser-cache/benchmark.cjs
node space/test_inference.cjs
node space/test_generation.cjs
```

Node 24.21.0 was used for these local checks. The VM-isolated conformance suite can be slow; its execution time is not used for speed claims. Benchmark reruns write a new benchmark.json beside their script; preserve the recorded artifact before rerunning. Serve space/ with a local HTTP server for browser testing.

This changes speed, not grammar, reasoning, context length or story quality. Model005 remains experimental with 0/12 prose-quality passes in its previous review. SPIN training was not run. Graphify and external research services were not run for this local implementation; direct source inspection supplied navigation.
