# Local evidence collector

This optional CLI exports a JSON array that Pocket PhD can import. It uses the already installed Crawl4AI environment and browser; it installs nothing, uses no LLM, starts no server, and does not use or reconfigure SearXNG. Run from your checkout:

```sh
/Users/sanjusrikanth/Documents/Codex/napolean-research/.venv/bin/python companion/collect.py 'https://docs.crawl4ai.com/' > selected-sources.json
python3 -m unittest discover -s companion -v
```

Use one to six explicitly selected public HTML pages on `pmc.ncbi.nlm.nih.gov`, `arxiv.org`, or `docs.crawl4ai.com`. Select the abstract or article HTML page, not a PDF/download. HTTPS with the default port is required. Credentials, query parameters, fragments, other hosts and non-public DNS resolutions are rejected. This conservative policy may reject legitimate pages. Do not use sensitive URLs.

Crawl4AI checks robots rules; access challenges, short/empty extracts, crawler failures, and non-2xx status codes fail the batch. There is no CAPTCHA bypass, recursion, autodiscovery, retry loop, or logged-in browser reuse. The browser disables page JavaScript, downloads, and iframe extraction and excludes common navigation tags and images from Markdown. For Crawl4AI documentation, text preceding the exact level-one heading matching its page title is removed, rejecting the page if that heading is absent. This prevents the known promotional banner from occupying the model excerpt. Other hosts retain their cleaned Markdown without this rule. Navigation removal is heuristic; manually inspect every exported excerpt for relevance and source identity. Some sites need JavaScript and will fail or yield incomplete evidence.

Limits: six pages, 30 seconds per page, 120 seconds per batch. A two-million-byte ceiling rejects returned HTML or Markdown after fetching; it does **not** cap network bytes transferred or browser memory before fetch completion. Each excerpt is at most 20,000 characters. Title and URL are bounded at 1,000 and 2,000 characters. An error exits nonzero without printing a partial JSON array (shell redirection can still leave an empty file). Crawl4AI diagnostics may use its own logging; confirm the output parses as JSON before import.

Each record contains title, URL, excerpt in the historical `abstract` field, null year and empty author list rather than inferred bibliographic facts. Extraction metadata records requested/final URLs and retrieval time. `content_sha256` is over the complete returned cleaned Markdown UTF-8 text before excerpt truncation, **not** the original HTML or all article content. `excerpt_sha256` hashes the exact exported `abstract` UTF-8 text. `truncated` means the selected main text exceeds the excerpt character cap; removing a documentation preamble alone does not set this flag. Documentation excerpts start at the title-matched main heading, so content and excerpt hashes can differ even without truncation. A false flag does not establish that the webpage or article itself was fully extracted.

Security boundary: the initial hostname/DNS check and final-URL check are conservative input/output policy checks, **not a network sandbox**. Redirects can be fetched before final-URL checking, and DNS changes and browser subresource requests are not fully contained. Only use selected trusted public sources; do not point this tool at suspicious links. It is inappropriate for arbitrary URL ingestion or deployment as a public service. Retrieved text is untrusted evidence, never instructions to execute. A successful extraction or imported pasted record does not verify a scientific claim, DOI, author list, or source authenticity.

The state directory defaults to `companion/.state`; installed browser files default to the existing local research runtime. Existing `CRAWL4_AI_BASE_DIRECTORY` and `PLAYWRIGHT_BROWSERS_PATH` environment values can override these locations. Do not commit local state or imported source files containing sensitive content.

Offline regression checks cover URL restrictions, private DNS, wrapper-success/HTTP-404 rejection, access challenges, out-of-scope final URLs, truncation, exact hashes, and bounded metadata. Live fetching is a separate manual smoke check, not part of these tests.

## Optional scholarly discovery

The local companion now supports selected scholarly engines through a separate SearXNG instance. It does not alter the existing general-search settings. Run these in separate terminals with the existing local research Python runtime:

```sh
/Users/sanjusrikanth/Documents/Codex/napolean-research/.venv/bin/python companion/start_science_search.py
/Users/sanjusrikanth/Documents/Codex/napolean-research/.venv/bin/python companion/discover.py 'explicit public research keywords'
/Users/sanjusrikanth/Documents/Codex/napolean-research/.venv/bin/python companion/discover.py 'explicit public research keywords' --sources > discovered-sources.json
```

The server binds only to 127.0.0.1:8889 and uses task-local settings and temporary cache directories under companion/.state. Its dedicated engines are PubMed and arXiv. The current installed Crossref SearXNG engine crashed on the representative query, so direct Crossref remains an explicit CLI provider and auto fallback instead of a default engine. The starter uses the existing SearXNG source tree; `--runtime` and `--port` select another local installation or port. It is a development-only loopback service, not a public deployment.

`discover.py` checks the configured engine inventory and refuses general engines. With `--provider auto` it falls back to direct Crossref when scholarly SearXNG is unavailable or empty, and reports why. `--provider searxng` fails instead of silently falling back; `--provider crossref` uses Crossref directly. `--endpoint` accepts only a loopback HTTP origin. Query text is forwarded to external scholarly providers; use explicit public keywords, not confidential notebook text. No paid API key is used.

Discovery returns up to eight deduplicated metadata records. SearXNG search snippets are intentionally **not** put into the evidence excerpt field. Import `--sources` JSON to select records, then collect accessible full article pages separately with `collect.py` when useful. A DOI or PubMed URL may need to be opened to locate its corresponding allowlisted PMC/arXiv HTML page. Nothing auto-crawls discovery results. Crossref abstracts are labeled metadata and remain unverified. Discovery does not establish relevance, study quality, complete coverage or novelty; inspect every record.

Discovery ranks titles by exact query-word overlap and requires at least two matching words (one for a one-word query) before the eight-result cap. This simple precision filter can miss relevant papers; review every result. Empty filtered results trigger the explicit Crossref fallback in auto mode.
