---
title: Orbis — Infrastructure Intelligence
emoji: 📊
colorFrom: gray
colorTo: blue
sdk: static
app_file: index.html
pinned: false
license: mit
short_description: Infrastructure capacity, cost efficiency and vendor ops.
---

# Orbis Infrastructure Intelligence

[Open the live dashboard](https://huggingface.co/spaces/PabloRod11/ledgerline-business-analyst) · [Pablo Rodriguez](https://huggingface.co/PabloRod11)

A working infrastructure operations and business economics workspace built as a no-cost startup-style portfolio product. Three tabs connect resource capacity to revenue, service reliability and unit economics. The app runs entirely in your browser, with no paid API, model endpoint, package download or hosted backend required.

All demo usage, costs, commitments, incidents and targets are **synthetic examples**. They do not describe actual AWS, GCP, Azure or Equinix prices, contracts or outages. Values use USD and UTC.

Orbis is the new identity for Ledgerline. The typography-led identity expresses a complete view of infrastructure. Existing browser profiles, saved views, source contracts, companion APIs and webhook headers retain their identifiers for compatibility. The Hugging Face repository URL is unchanged.

## Three tabs, one persistent scope

| Tab | Audience | Decisions supported |
|---|---|---|
| Executive summary | CFO, VP Engineering, VP Infrastructure | How infrastructure spend and capacity affect contribution margin and cost per transaction |
| Capacity & utilization | Infrastructure engineers, SREs, capacity planners | Where observed saturation sits, and how demand/capacity/efficiency assumptions change headroom |
| Unit economics & vendors | BizOps, FinOps, procurement | How costs reconcile across providers and tiers; commitment utilization and observed service-target performance |

The fixed global header spans every tab. It includes Last 24h, Last 7d, **Last 30d by default**, QTD and YoY; Production/Staging/Development; multi-select cloud providers and regions; and Enterprise/Growth/Free tier segments. Filters survive tab switches and reloads and apply to all metrics, simulator baselines and exports. Provider/region drill actions update that same scope.

YoY is trailing 365 days compared with the prior 365 days. QTD starts at the source calendar quarter. The demo ends at November 3, 2026, 00:00 UTC; presets anchor to the latest completed source interval. Last 24h uses hourly observations, while older history uses daily aggregates. Date and source coverage are displayed rather than disguised as a live feed.

## Run locally

Requires Python 3.11+ or any static HTTP server. Node 22+ is needed only for tests.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173`. Do not open `index.html` as a `file:` URL; modules and data require HTTP. No install or frontend build step is needed.

When cloning, use Git LFS to download `data/infrastructure.csv`. If Git LFS is unavailable, run `python3 data/generate_infra.py` before starting the server; this regenerates the exact bundled synthetic dataset. A Git LFS pointer is not a usable CSV. Required demo loading has a 20-second network deadline, including the response body; retry through Workspace → Restore historical demo after a timeout.

## Startup tools

Source/health, profile/bookmark, sharing, CSV/JSON export, digest and print controls support the three analytical tabs through utility dialogs. Imported local data stays in the browser unless you deliberately connect to a source. No telemetry is included.

- CSV import validates the infrastructure schema, intervals, capacity bounds and provider/region membership. Rejected files preserve the last good source.
- Weighted capacity-hours prevent averaging large and small resources equally. Observed peak allocated-cohort CPU is separate from period-average utilization.
- Demand/capacity/efficiency scenarios calculate a baseline, projected utilization and additional capacity needed for a 75% CPU planning target.
- Anomaly signals use prior history. Statistical transaction forecasts expose method, holdout error and illustrative uncertainty when sufficient daily history exists. Explanatory insights are calculated locally and do not call an LLM.
- Local profiles and validated bookmarks persist in the current browser. They are personalization, not authentication or SaaS tenant isolation.
- Filtered exports use the active scope. Shared/embed links include validated state, never uploaded data or credentials.

## Connections and automation

The optional [local Python companion](companion/README.md) keeps credentials on the owner's machine and supports configured read-only SQLite/PostgreSQL or normalized semantic HTTPS sources. It provides signed pipeline events/webhooks, real schedules, whole-source digests and execution logs. New sources explicitly select `schema: "infrastructure-v1"`.

SQLite is included and exercised locally. PostgreSQL needs its optional driver and real owner credentials; semantic endpoints need a schema mapping and credentials if required. Legacy retail sources remain supported by the companion, while the new dashboard requires the infrastructure contract.

A free Static Space cannot execute unattended jobs or hide warehouse secrets. The companion must remain running for schedules; nothing is delivered while the owner's computer is off. No external notifications or recurring jobs are activated by default. For local connections, open the companion-served dashboard to avoid browser restrictions on a hosted HTTPS page contacting HTTP localhost.

## Data, formulas and limits

See [the infrastructure contract](docs/infrastructure-contract.md), [product design](docs/infrastructure-design.md), [architecture](docs/architecture.md), and machine-readable `data/infrastructure-metrics.json`.

Source facts are non-overlapping environment/provider/region/tier intervals with attributed revenue, full allocated invoice costs, request/error counts, capacity-hours, latency sums and commitment budget/application fields. Tier capacities are allocations rather than full shared pools repeated per tier. Undefined ratios display as a dash. Zero revenue in a free tier is valid and does not create a fabricated margin.

Compute invoice cost already includes prepaid commitments and unused prepaid capacity. Commitment budget is a separate audit measure and is not added a second time to total cost. Observed request success is compared with synthetic transaction-weighted service targets; it does not infer legal SLA credits or real vendor contractual rights. Latency is a weighted mean, not p95. Segment cohorts do not establish a unique tenant count.

Regenerate the exact synthetic dataset:

```sh
python3 data/generate_infra.py
```

Capacity forecasts/scenarios are exploratory planning tools, not guaranteed hardware requirements. Daily history cannot establish intra-day peaks or individual host saturation; partial-interval slicing assumes uniform activity inside an aggregate interval. Read the visible method/coverage notes before interpreting a comparison.

## Tests and deployment

```sh
npm test
npm run check
python3 -m unittest discover -s tests -p 'test_*.py'
```

No production JavaScript dependencies or default Python packages are required. See [verification](docs/verification.md) for observed check results and limits. The original retail analytical library remains tested as compatibility coverage; infrastructure calculations use the new fact contract.

The existing public Hugging Face Space uses `sdk: static` and `app_file: index.html`. To deploy your own copy, upload this folder's source contents at the repository root, preserving directories. Never upload private configuration, runtime databases or real private datasets. Public Space code and bundled data are publicly visible. [Static Space documentation](https://huggingface.co/docs/hub/spaces-sdks-static).

This is a tested startup foundation, not a certified multi-tenant SaaS. Identity, server-side authorization, durable customer isolation, managed uptime, actual warehouse validation and operational ownership remain [launch requirements](docs/launch-readiness.md). License: MIT.


## Decision workflows in v2.1

Observed cohort exceptions now lead every tab. Inspect applies the exact provider, region, environment and tier while preserving the selected time range. Capacity tables prioritize risk. The simulator evaluates CPU, memory and storage together, identifies the binding planning target (75% CPU, 85% memory/storage), and retains overload and negative headroom rather than clamping them. These remain pooled scenarios, without workload placement, hardware lead times or failover guarantees.

The executive view labels margin after infrastructure and presents cost per million transactions. A reconciled spend bridge separates transaction-volume and blended unit-cost/mix effects, with entering and exited providers included. It is arithmetic attribution, not proof of causality. Revenue and infrastructure spend have aligned charts with independent scales. Every time-series chart offers keyboard point inspection and a scrollable data table; values use explicit USD/percent/count rounding.

Forecast training uses up to 120 complete UTC days from the same selected cohorts, independent of the chart window. It excludes future and incomplete days, abstains on missing cohort coverage, and reports a frozen 14-day holdout against a last-value benchmark. Hourly views retain hourly KPIs and utilization charts; their demand forecast shows a labeled daily context. Bands remain illustrative and uncalibrated.

Economics adds cohort-level SLO error budgets and an optional provider-level contract registry. Four synthetic examples are labeled illustrative. Add/edit, JSON import/export and renewal notice status work locally; metadata is isolated by loaded source provenance, never shared through view links, and never changes billing or establishes legal SLA credits. Up to 50 records and 512 KB JSON are supported. Export records for backup. The fact schema has tier cohorts, not tenant IDs or a unique tenant count.

Save view opens a focused dialog, with a nearby saved-view selector. Workspace separates sources/quality, profiles/saved views, exports/sharing and automation. Schedule presentation includes last source run, next attempt, destination class, retry policy and overdue status. It cannot confirm the scheduler process is running. `/api/sources` returns authenticated, sanitized operations flags without exposing destination URLs, secrets or local paths. No paid APIs or always-on service was added.


## Investigation and reliability improvements in v2.2

Recent SLO burn uses the latest complete observed hour or day, separately from selected-period compliance. Warning starts at 2× allowance and critical at 10×; errors against zero allowance are critical. Missing, overlapping, stale or prorated recent intervals are unavailable, not healthy. These exploratory thresholds are not a calibrated paging policy. A cohort can meet its period target while consuming allowance quickly in its latest interval.

Inspect preserves your prior filters/tab and exposes the exact observed interval. Return restores the prior analysis within the current source. Manual scope changes, saved views and successful source reloads end the investigation. Daily allocation averages never become inferred hourly peaks. Headline alerts show up to two items; View all opens complete cohort lists without narrowing scope.

Renewals sort by notice deadline, show overdue/today/upcoming notice labels and support Needs review (notice due within 30 days or passed). Mobile exposes a Filters toggle, a complete scope summary and a Dashboard view selector. Incompatible region recovery removes only regions excluded by selected providers.

Forecast evaluation now compares the statistical model, last training value and repeated last training week on the same frozen 14-day holdout. The seasonal baseline never learns from holdout observations. MAE includes zero actuals; MAPE excludes them. Skill is unavailable when the seasonal baseline has zero error. The synthetic demo's model does not beat its weekly baseline.

Startup serves optional contract examples through the local companion; unavailable or stalled metadata degrades to validated billing facts after a two-second metadata deadline. QTD uses the last included instant at quarter boundaries. Both validators reject allocated prepaid commitments exceeding the containing compute invoice, with an identical USD 0.000001 tolerance. The reference webhook receiver applies its 15-second idle timeout before reading headers; it remains a serial, loopback utility without an absolute header deadline or internet-facing denial-of-service protection.

## Design history

Earlier Ledgerline releases are documented below. The current Orbis identity is specified in [DESIGN.md](DESIGN.md).

## Design polish in v2.3

KPI summaries now appear before compact, expanded investigation alerts across all three tabs. The existing teal/offwhite identity is retained, with stronger secondary-text contrast, clearer typography, consistent provider drill links, and proper save-dialog spacing. Mobile Period controls are more legible, expanded filters scroll on short screens, and open popups reposition after resizing. No analytical calculation, source data, paid dependency or background service was added. See [design conventions](docs/design-system.md).


## Full polish in v2.4

The complete analysis path keeps keyboard focus through Workspace navigation, scenario application, renewal review and contract editing. Source actions expose progress and suppress repeats; stale snapshots cannot replace disconnected state, and a failed replacement connection preserves existing controls. Local profile/bookmark changes are atomic when storage fails.

Tablet KPIs and filters fit without concealing values or Reset. Long vendor records wrap, chart tables support keyboard scrolling with sticky column headers, utilization lines have matching solid/dash/dot legend samples, and missing numeric observations are explicitly labeled. Print styles release table clipping. Empty scope and export/import feedback provide recovery guidance. Calculations, synthetic facts and no-cost operating constraints remain unchanged.
