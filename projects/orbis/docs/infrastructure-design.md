# Infrastructure BizOps workspace

Ledgerline connects infrastructure operations to business outcomes in three audience-specific tabs. It keeps the existing free static hosting and owner-operated companion model. All demo infrastructure usage, prices, costs, commitments, incidents and SLA targets are synthetic examples, not real vendor quotes or contracts.

## Shared scope

One fixed header spans the whole viewport and remains visible while scrolling and switching tabs. Its controls include Last 24h, Last 7d, Last 30d (default), quarter to date, and YoY; environments Production, Staging and Development; a multi-select AWS/GCP/Azure/Equinix co-lo provider and region selector; and Enterprise/Growth/Free tier segments. Empty selection means all values. Selections within a dimension combine with OR; dimensions combine with AND. Provider and region choices may intentionally produce an empty intersection, which is displayed honestly.

YoY means trailing 365 days versus the preceding 365 days. QTD starts at the current source quarter, using the same elapsed-duration previous period for comparison. Periods anchor to the latest completed source interval, not the viewer's computer clock. The synthetic source ends November 3, 2026 at 00:00 UTC. Last 24h uses actual hourly observations; older history uses daily aggregate intervals. All periods are half-open [start, end), and any partially intersecting aggregate interval is apportioned by elapsed duration. That apportionment assumes activity is uniform inside the interval and is disclosed as an estimate.

The same selected facts feed every tab, simulator baseline, insight and export. Validated scope persists across tab changes, reloads, bookmarks and shared links. Local profiles provide device-level personalization, not authenticated tenancy.

## Executive summary

For the CFO, VP of Engineering and VP of Infrastructure. Revenue, total infrastructure spend, contribution margin and cost per transaction lead into revenue/cost trends and spend composition. Provider and tier comparisons connect engineering capacity to economics. SLO and observed saturation signals sit beside their business implications. Insight text is generated from calculated statistics and does not call a language model.

## Capacity and utilization

For infrastructure engineers, SREs and capacity planners. CPU, memory and storage utilization use weighted capacity-hours. Peak observed allocated-cohort CPU utilization is separately labeled so a selected-period average does not conceal a saturation event. Provider-to-region drill-downs use the same global scope.

Demand growth, capacity change and efficiency parameters model CPU, memory and storage utilization together. Required capacity uses 75% CPU and 85% memory/storage planning targets and identifies the binding resource. These independent scenario assumptions do not establish future hardware requirements with certainty. A statistical transaction forecast overlays future daily observations where sufficient history exists; method, holdout error and illustrative uncertainty are visible. The hourly 24-hour view retains hourly operational metrics while the daily forecast draws on up to 120 earlier complete scoped days; it labels that independent daily context.

## Unit economics and vendors

For BizOps associates, FinOps specialists and procurement leads. Cost per transaction, contribution margin, commitment utilization and eligible-spend coverage summarize efficiency. Provider, region and segment breakdowns reconcile compute, storage, network and support costs. Allocated commitment budget and applied usage are an audit lens rather than extra costs added again to the invoice total.

Vendor service performance compares observed request success against transaction-weighted target success. These are synthetic illustrative SLO/SLA targets; the app does not infer legal credits, vendor fault, contractual entitlements or actual provider outages. Latency is a request-weighted mean; aggregate input does not provide a trustworthy p95.

## Preserved startup tools

A utility surface provides source selection, local CSV import, companion connection, source-wide quality/pipeline health, local profiles/bookmarks, share/embed, filtered exports/print/digest, and real companion schedules/execution logs. These tools support the three primary tabs rather than adding unrelated main tabs.

The optional companion keeps warehouse credentials local, uses configured read-only sources and signed pipeline/webhook events, and runs scheduled jobs only while its owner-operated process is available. No paid service, external notifications or recurring job is activated by this redesign. Existing retail-schema sources remain supported by the companion for backward compatibility; the new UI accepts the infrastructure schema.

See README Decision workflows in v2.1 for exception-first hierarchy, the financial bridge, accessible chart inspection, frozen forecast validation, local contract metadata and task-oriented workspace tools.
