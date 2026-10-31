# Focused upgrade — 2026-10-20

Unreadable notebook data is preserved. New results remain exportable when saving is blocked. A best-effort stale-history check rejects saves after another tab changes the notebook. Reduced-motion preferences also apply to result scrolling.

Verification: `node test-storage.cjs`

Static hosted files changed; existing downloadable companion source archives remain upstream originals. No new runtime dependencies.
