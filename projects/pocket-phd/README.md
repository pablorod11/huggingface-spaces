---
title: Pocket PhD
emoji: 🔬
colorFrom: gray
colorTo: red
sdk: static
app_file: index.html
---

# Pocket PhD — no-cost local AI

A static research notebook with six sequential scientific-method roles. No Docker, paid hosting, model API key, or metered inference.

Choose **Load free local AI** to download Qwen2.5 1.5B via WebLLM (roughly 1 GB; device memory requirements vary). Requires a compatible WebGPU browser and GPU. Inference runs on your device. Model/code downloads contact public CDNs and Hugging Face.

Optional scholarly retrieval sends your question or keywords to the free Crossref API and returns up to eight metadata records, with abstracts where available. No full-text systematic review is performed.

Select **Local AI**, enable Crossref retrieval or paste evidence, then start an investigation. Local AI requires at least one evidence record. Small-model structured-output failures preserve completed stages and mark the result partial or failed. The deterministic method demo remains available.

Notes stay in this browser and can be exported. If saving fails, results remain visible for export with an explicit unsaved warning. Stop investigation terminates the model worker and preserves completed stages; reload the model before another AI run. Browser storage can be cleared. Context is bounded to six records and 800 characters per excerpt; the notebook retains complete evidence. Citation checks validate IDs, not claim support. All novelty is unverified. Expert review remains necessary.

WebLLM: https://webllm.mlc.ai/docs/
Crossref access: https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/

## Verification and current limits

Crossref retrieval was verified in the deployed Space with eight real records. Earlier CDN-based Local WebGPU model loading was verified locally and in the Space; the new bundled runtime was also verified locally through model loading, one generated stage and Stop preserving that stage. WebLLM is pinned to 0.2.80 after compatibility failures with 0.2.85. Boundary tests use mocked model outputs and check evidence provenance, retained excerpts, output validation, and failed-stage preservation. Full six-stage model reliability is not yet established; the embedded test browser is slow. Use a WebGPU-capable desktop browser. This local AI path is experimental.

## Evidence import and export improvements

Import a JSON source array using **Add your own evidence → Import evidence JSON**, or paste it directly. Files are read locally, with a 500,000-byte file ceiling, a 250,000-character JSON ceiling and at most 20 records. Titles are limited to 1,000 characters, URLs to 2,000 and excerpts to 20,000. Optional extraction metadata survives normalization and is visible in the evidence library and exports; it is reported provenance, not proof of authenticity or claim support. Existing saved notebooks remain readable.

**Preview Local AI evidence context** shows which supplied records enter the model and the exact excerpt prefixes. Local AI uses up to six selected records and 800 characters per excerpt; the default selects the first six, with supplied records before optional Crossref additions. The resulting evidence library marks records outside model context. A title-only or uncited gap remains speculative and low confidence even if another record has an excerpt. These guards do not assess semantic entailment.

Markdown notes now retain run completeness, errors, model identity, timestamp, retrieval metadata and unsaved warnings. JSON still exports the complete run. Crossref query disclosure now explicitly includes the research-question fallback when optional search terms are blank.

### Optional local collector

See [companion/README.md](companion/README.md). The selected-page Crawl4AI collector runs locally in an existing Python/browser runtime and emits source JSON for import. It is not a browser feature or public crawler service. No SearXNG settings or external services are changed by the app. The optional local companion supplies a separate scholarly SearXNG configuration and explicit Crossref fallback; see its README for current verification and limits.

Run all local checks with:

```sh
node --test test-*.cjs
python3 -m unittest discover -s companion -v
```

Pipeline tests use mocked outputs and establish boundary behavior, not real model quality. Full six-stage WebGPU reliability remains unverified.

## Remaining workflow improvements

Stop is available during evidence preparation and generation. The same cancellation signal covers Crossref retrieval, schema fetch, and inference. Model loading has its own Cancel action and a three-minute deadline; schema loading and each generation stage have two-minute deadlines. Terminal timeouts stop the worker; reload the model before another AI run. Partial and stopped runs retain completed stages. Each completed stage updates the same stable notebook entry and renders without stealing focus; final results receive keyboard focus. Checkpoints are best-effort browser storage, not a transactional multi-user database or a guarantee against crashes within an unfinished stage.

Add evidence through title/URL/excerpt controls or advanced JSON. Choose up to six imported/pasted sources in the context preview; selection is preserved in run metadata. At least one source must be selected for Local AI. Crossref results retrieved during a run fill the default first-six context; to select those individually, import their JSON before starting. No automatic model-mode switch occurs: the ready message and Start label make the explicit choice visible.

Private session keeps new results and checkpoints in memory and refuses notebook deletion or clearing. It does not erase existing notebook data, isolate shared browser profiles, or clear model caches. Export private results before leaving. Clear notebook affects only this app's persistent notebook key, after confirmation; other browser data and model caches remain. Results use keyboard-operable ARIA tabs, final heading focus, and long-text wrapping.

WebLLM 0.2.80 is bundled locally with an exact dependency lockfile and license notices; see vendor/README.md for reproducible rebuilds. Serving the static app requires no npm install. Remote model configuration, tokenizer, weights and model-library WASM remain external and are not all pinned to immutable revisions. Full offline operation and production security are not claimed.

## Evidence review

Open **Add your own evidence → Review evidence and Local AI context** to see record and selection counts, remove unwanted records, and undo the last removal. Explicit selections follow the remaining records when source IDs change. Undo restores the exact previous evidence text and selection; changing evidence or selection makes that undo unavailable. Removal affects the current form only, not saved investigations. Controls are disabled during an investigation.
