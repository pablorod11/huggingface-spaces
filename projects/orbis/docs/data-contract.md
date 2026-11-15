# Legacy retail source and metric contract

This document describes the retained retail compatibility library. The primary Infrastructure BizOps UI uses `infrastructure-contract.md`.

Contract version: 1. Currency: USD. All inputs must share one currency. Monetary values are ordinary numbers at two decimal places in the demo; this project is analytical software and not an accounting ledger.

## Input facts

CSV has a header and these required columns:

| Field | Meaning | Validation |
|---|---|---|
| id | Unique aggregate fact ID | Nonempty string, unique |
| date | Business date | Valid ISO YYYY-MM-DD |
| region | Parent geographic group | Nonempty string |
| country | Geographic child | Nonempty string |
| channel | Acquisition/sales channel | Nonempty string |
| category | Parent product group | Nonempty string |
| product | Product child | Nonempty string |
| revenue | Total revenue | Finite number >= 0 |
| cost | Variable cost | Finite number >= 0 |
| orders | Non-overlapping aggregate order count | Integer >= 0 |
| units | Units sold | Integer >= 0 |

Uploads are bounded to 5 MB, 50,000 facts and a maximum 7,310-day source date span (about 20 years), to bound daily-series allocation. The browser rejects malformed data and keeps the last good source. A valid zero revenue is allowed; associated margin is undefined. A cost above revenue is allowed and produces a negative margin. Empty labels are not valid dimension members. Do not mix order-line facts with aggregate counts: orders must sum correctly across every dimension.

## Metrics

Definitions are machine-readable in `data/metrics.json`. Revenue, cost, orders and units are additive; profit = revenue − cost. Margin = 100 × profit / revenue. Average order value = revenue / orders. Zero denominator yields null, never infinity. A scenario can add fixed costs to variable cost for a selected period; ordinary source contribution profit does not include fixed costs.

## Snapshot API

The authenticated companion snapshot contains `sourceId`, `fetchedAt`, `dataThrough`, `rows` and `pipelineStatus` (`status`, `lastSuccess`, `message`). Browser imports pass through the same typed input contract. Configuration names sources; browser callers cannot supply SQL, server file paths or semantic URLs. The semantic adapter accepts normalized facts in `{ "rows": [...] }`; pre-aggregated arbitrary metric APIs require a mapping to this contract.

Source-wide quality checks run before filtered analysis. A demo source's historical coverage is displayed as historical, not disguised as today's live feed. Pipeline last success and data-through date measure different things.

## Filter and state contract

Filters combine across dimensions with AND, and within a dimension with OR. Custom dates are inclusive and UTC. Region/country and category/product drill actions use the same filter state as KPI calculations and downloads. Shared links carry public filter state only; they do not upload the selected file or include companion secrets. Bookmarks and profiles live in the current browser and origin.

## Extending sources

Validate source grain, currency and order uniqueness before connecting real data. Use read-only database identities and a reviewed, fixed query that aliases columns to the names above. PostgreSQL, SQLite and semantic HTTP are explicit supported examples, not universal compatibility with every warehouse or semantic layer product.
