# Explicit-source web corpus preparation

This offline operator tool prepares candidate documents only. It does not crawl links, call inference APIs, train, alter model 003, or publish anything. It uses Python's standard library.

Create `work/web-sources.json` with an explicit source allowlist:

```json
{
  "sources": [
    {
      "url": "https://example.org/approved-story.txt",
      "license": "CC0-1.0",
      "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
      "attribution": "Author and title, supplied by the operator",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000"
    }
  ]
}
```

The all-zero digest is a syntactically valid placeholder for dry runs, not a real document hash. Replace the URL, attribution, license and SHA-256 with an actually approved document before a real run. A document hash must be obtained during prior source review; do not auto-approve changing bytes. The license and approval fields are operator assertions, not legal verification. No license pages are fetched.

Supply UTF-8 JSONL exclusions, one complete document per line, each with a `text` field:

```json
{"text": "Complete text of one existing story, without its attribution notice."}
{"text": "Complete text of another existing story."}
```

Include every existing model-003 train, validation and test story, plus the original model corpus, to screen against them. These files are not generated automatically: preserve original whole-story boundaries when preparing them. Do not supply a joined train.txt file as a single document. The tool cannot verify exclusion completeness and makes no claim of automatic isolation from existing corpora. Supplying an empty exclusion file is permitted but provides no existing-corpus protection. Exclusion file hashes are recorded. Exclusion membership must only reject overlap; do not inspect test losses or targets to tune the pipeline.

Run from the project root, using a new output directory:

```sh
python3 scripts/prepare_web_corpus.py --allowlist work/web-sources.json --exclude work/existing-stories.jsonl --output work/web-candidate --dry-run
python3 scripts/prepare_web_corpus.py --allowlist work/web-sources.json --exclude work/existing-stories.jsonl --output work/web-candidate
python3 -m unittest tests.test_web_corpus -v
```

Dry run validates local metadata and exclusion inputs, makes zero network requests, and writes nothing. Real runs request only exact allowlisted HTTPS document URLs and their origin's `/robots.txt`. All redirects, non-200 responses, compression, missing/unavailable/unrecognized robots policies, denied paths and unsupported robots pacing directives abort the run. Robots must be UTF-8 text/plain with applicable explicit rules; this deliberately rejects some otherwise usable sources. Each origin is paced at least one second after the previous response (robots included); insufficient deadline budget rejects the next request. Network failures fail closed. No recursive discovery or sitemap processing occurs.

Defaults: 20 pages, 2 MiB per document, 20 MiB aggregate received bytes including robots, 120 seconds total. Hard CLI caps: 100 pages, 2 MiB/document, 40 MiB aggregate, 300 seconds. Robots are capped at 64 KiB; individual network blocking calls use a timeout of at most ten seconds. The deadline is checked between reads, so a blocking operation can extend elapsed time by at most its timeout. Exclusions have an aggregate byte limit equal to the selected total budget and a 5,000-document cap. Comparison cost is quadratic within these caps.

Strict UTF-8 text/plain or simple HTML is accepted. HTML extraction excludes head, script, style, nav, noscript and template contents; it is a simple extractor, not a semantic article reader. Text is normalized into the current fixed 51-character alphabet and whitespace is collapsed. Documents shorter than 128 normalized characters are discarded. Exact matches and 5-word-shingle Jaccard similarity >=0.8 are rejected against exclusions and accepted documents before any split. Near-duplicate screening is heuristic and can miss paraphrases, short overlap and containment within much longer documents.

Documents are processed in URL order and assigned whole to train/val/test using SHA-256 of normalized content (80/10/10 hash buckets). Small samples may have empty splits; the manifest reports split counts and an explicit not-ready warning. Review counts before training. `documents.jsonl` records normalized text, split, text hash and full source provenance. `manifest.json` records input hashes, accepted count, rejected reasons, fixed alphabet identity, byte count and policies. Fetch/hash/robots failures happen before output creation. An existing output path is rejected before network access. A local write failure may leave a partial new directory; inspect it rather than rerunning over it.

Keep candidate data separate from the deployed Space. Tune any future experiment on training/validation only; freeze selection before evaluating a fresh unseen test set. The already observed model-003 test is regression evidence, not a fresh holdout for iterative decisions. No claim about model improvement follows from preparing this corpus.
