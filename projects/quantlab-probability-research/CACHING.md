# Caching choices

The implemented default is a three-entry, ten-minute cache of deterministic fitted browser runs in tab memory. Its key contains the model revision, selected validation protocol and exact validated dates/prices. Changes to raw whitespace alone can reuse the fit, but the cleaning audit is rebuilt each time. A changed date, price or model revision misses the cache. Every cache hit is labeled; no speed benchmark is claimed.

This avoids refitting identical inputs without making uploaded price histories persistent. There is no localStorage, IndexedDB, shared account cache, service worker or remote inference cache. Clear forecast data removes current results, selected CSV, worker and cached runs. Expired entries cannot be served; background timers may run late, so memory reclamation is not an exact ten-minute secure-erasure guarantee. Browser reload clears this application cache.

Public app assets are a separate layer. Their URLs carry a release version so a new release can be fetched distinctly. The host controls response headers; this project does not claim to have changed its CDN policy. The public saved Python benchmark uses fetch cache:no-cache: the browser revalidates a stored response before reuse. This differs from no-store, which bypasses and does not update the HTTP cache. See [MDN Request.cache](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache).

If persistent caching becomes useful, require explicit opt-in and retention controls first. If live market feeds are introduced, freshness must also include instrument, provider, exchange calendar, adjustment revision, as-of timestamp and model/training revision. TTL alone would not establish that a market forecast is current.


Experiment provenance is separate from computational caching. Every successful result view, including a cache hit, receives a new tab-local inspection sequence. History retains at most 25 metadata entries, has no persistent storage, and resets on Clear forecast data or reload. Cache expiry does not erase inspection history. Normalized input SHA-256 is computed locally before cache lookup; clearing during hashing invalidates the pending run.
