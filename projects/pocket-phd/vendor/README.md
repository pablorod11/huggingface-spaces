# Pocket PhD browser runtime

`web-llm.js` is the local ES module bundle of **@mlc-ai/web-llm 0.2.80**.
The main page and module worker use the same file. No runtime bare-module
imports or JavaScript CDN imports remain in this bundle.

Rebuild from the project root with Node.js and npm:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:vendor
```

The lockfile pins WebLLM, loglevel 1.9.2 and esbuild 0.25.12, including the
platform-specific build binary. Dependency lifecycle scripts are unnecessary
and must remain disabled. The checked-in bundle requires no npm installation
when serving the static app. Do not publish `node_modules/`.

The build checks the export names `CreateWebWorkerMLCEngine` and
`WebWorkerMLCEngineHandler` and rejects any remaining external JS imports.
`build-manifest.json` records the bundle SHA-256, byte count, exports and inputs.
The bundle is transformed from upstream JavaScript without source changes.

## Network and verification limits

This is **not an offline model distribution**. Loading the selected model still
fetches model configuration, tokenizer and weight shards from the model's
Hugging Face repository (currently `mlc-ai/Qwen2.5-1.5B-Instruct-q4f16_1-MLC`,
with possible Hugging Face storage/CDN redirects). WebLLM's built-in model map
fetches the model-library WASM from
`raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/`.
These upstream model URLs are not pinned to immutable revisions by this patch.
WebLLM also includes tokenizer/grammar runtime code and embedded WASM data.
Browser caches can retain downloaded assets. Network-free inference is not
promised, and building this bundle never downloads weights or initializes GPU
inference. Actual GPU/model compatibility requires a browser runtime check.

## Attribution

WebLLM and the bundled MLC runtime components are distributed under Apache 2.0;
see `licenses/web-llm-Apache-2.0.txt` and the upstream package at
https://www.npmjs.com/package/@mlc-ai/web-llm/v/0.2.80 . The upstream source
repository is https://github.com/mlc-ai/web-llm .

loglevel is MIT licensed; see `licenses/loglevel-MIT.txt`. Upstream embedded
copyright/license comments (including Apache Software Foundation, Microsoft,
and OpenAI notices) are preserved verbatim in `licenses/upstream-notices.txt`;
comments recognized as legal notices also remain inline in the bundle.
esbuild is an MIT-licensed build tool, not runtime application code.
Model weights and remote artifacts retain their separate upstream licenses.
