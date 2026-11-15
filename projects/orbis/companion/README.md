# Ledgerline local companion

Python 3.10+; standard library by default. Run commands from the Ledgerline project root. The companion serves the dashboard and fixed API on `http://127.0.0.1:8765` and never starts a scheduler automatically.

## Start locally

1. Copy `companion/config.example.json` to `companion/config.local.json`.
2. Replace both secrets with **different** random values, e.g. `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'` twice. Keep the config private and out of your public Space/repository.
3. Run `python3 -m companion.runner --config companion/config.local.json serve`.
4. Open `http://127.0.0.1:8765`; use that URL and the configured `token` in Connections. Tokens remain in the browser session only. Exact allowed origins include scheme and port, without trailing slash.

Paths in configuration resolve relative to the command's working directory. The example SQLite seed imports `data/infrastructure.csv` only when that source has no stored rows. Restarting preserves data. The example uses a new `companion/state/infrastructure-v1.db` file. Keep existing warehouse configurations and retail state intact; migration is explicit. To reseed, stop the runner and remove only the intended private state database deliberately. For real refreshed data use a read-only warehouse or semantic source.

`/` serves only index.html, fixed src JavaScript/CSS filenames and the explicitly listed retail/infrastructure CSV and metric data. It never serves config, Python, state, outputs, arbitrary paths, or hidden files. Static files are public; all API routes except health and signed events require bearer auth. No SQL, URLs, destinations, filesystem paths or credentials can be supplied through API requests.

## API

| Method | Route | Contract |
|---|---|---|
| GET | `/health` | `{ok,service}`; no authentication or configuration details |
| GET | `/api/sources` | `{sources:[{id,label,type,schemaVersion}]}` |
| GET | `/api/snapshot?source=infra-demo` | `{sourceId,schemaVersion,fetchedAt,dataThrough,rows,pipelineStatus:{status,lastSuccess,message}}` |
| POST | `/api/run` | `{sourceId:"infra-demo",dryRun:true}` → `{status,files,quality,digest}` |
| GET / PUT | `/api/schedules` | `{schedules:[{id,sourceId,enabled,everyMinutes,dryRun,nextRunAt?}]}` |
| GET | `/api/logs` | `{logs:[{id,at,sourceId,status,message}]}`; latest 100 |
| POST | `/api/events` | Signed event below; signature replaces bearer auth |

Bearer header: `Authorization: Bearer YOUR_TOKEN`. Schedule IDs/source IDs use letters, digits, `_` and `-`; intervals are integer minutes 1–525600; maximum 50 schedules. `nextRunAt` is Unix epoch seconds. PUT replaces the schedule collection atomically. Same unchanged schedule retains its next run. New schedules first run after their interval. Empty list removes all schedules. Error JSON omits credentials and internal exception details. CORS is an exact origin allowlist, including OPTIONS; no wildcard. Native signed senders omit Origin.

Sources without `schema` continue to use the legacy retail contract. Retail fact rows require `id,date,region,country,channel,category,product,revenue,cost,orders,units`. Dates are exact ISO calendar days, IDs unique; strings nonempty; numeric values finite and nonnegative; orders/units integer. Limits: 5 MB CSV/HTTP response/request and 50,000 rows, and at most 7,310 days between earliest and latest source date (matching browser validation). Semantic HTTP and database operations use 10 second timeouts; incoming socket timeout is 15 seconds. This local HTTP server is a single-owner utility, not an internet-facing production gateway.

## Infrastructure contract

Opt in per source with `"schema":"infrastructure-v1"`; this works for CSV seeds, read-only SQLite, PostgreSQL and semantic normalized rows. The example source ID is `infra-demo`, with `mode:"demo"` so fixed historical data never claims current freshness. No source or user warehouse is automatically migrated.

Columns in export order:

```text
id,timestamp,hours,environment,provider,region,tier,transactions,errors,revenue,computeCost,storageCost,networkCost,supportCost,cpuCapacityHours,cpuUsedHours,memoryCapacityGbHours,memoryUsedGbHours,storageCapacityGbHours,storageUsedGbHours,latencyMsSum,committedCost,coveredCost,slaTarget
```

UTC timestamps use exact `YYYY-MM-DDTHH:mm:ssZ`. Each fact starts on an exact UTC hour and is a half-open interval; hours is 1 or 24, with 24-hour intervals starting at UTC midnight. Infrastructure `dataThrough` is the latest interval **end**, not start. Environments are production/staging/development; providers aws/gcp/azure/equinix; tiers enterprise/growth/free. Provider regions are aws us-east-1/us-west-2, gcp us-central1/europe-west1, azure eastus/westeurope, equinix dc2/sv5.

IDs are unique. Numeric values are finite and nonnegative; transactions/errors are integers; errors cannot exceed transactions. SLA target is a 0–1 fraction. Used CPU/memory/storage capacity cannot exceed allocated capacity. Covered cost cannot exceed either compute cost or committed cost. Intervals cannot overlap within the same environment/provider/region/tier. Limits are 100,000 facts, 20 MB seed CSV/semantic response and 737 days from earliest start to latest end. Authenticated control requests and signed events retain the 5 MB limit; there is no fact-upload endpoint.

Infrastructure digests report USD revenue, totalCost, contribution and percent margin, per-transaction costs, transaction-weighted SLA target/success, average response latency, weighted allocated resource utilization and cohort peak CPU utilization. Committed cost is a separate budget audit measure; computeCost already includes allocated prepayment/unused commitment, so committedCost is never added to spend again. Zero denominators return null. Quality includes schema, numeric capacity, interval allocations and freshness. A failed SLA or cohort CPU utilization at least 85% produces a `threshold.alert`; freshness warnings produce `quality.alert`. Alerts and failures use existing signed delivery only when explicitly enabled. All demo vendor/commitment figures are synthetic, not actual contracts.

## Sources

Included source `type: "sqlite"` seeds an internal SQLite fact store and uses a fixed parameterized read. A real normalized SQLite warehouse may instead use:

```json
{"id":"warehouse","label":"Retail warehouse","type":"sqlite","readOnlyDatabase":"/owner/path/warehouse.db","table":"facts"}
```

The file opens in SQLite `mode=ro`; a progress handler bounds queries to about 10 seconds. Table names are validated simple identifiers and selected columns are fixed to the fact contract. No arbitrary request SQL.

A semantic endpoint source:

```json
{"id":"semantic","label":"Semantic API","type":"semantic","url":"https://owner.example/api/facts","headerEnv":"RETAIL_API_AUTH","headerName":"Authorization"}
```

Set `RETAIL_API_AUTH` in the environment (including `Bearer ` if required). Response is `{ "rows": [FactRow] }`. HTTPS only; all redirects rejected, bounded response, normalized schema validation. Endpoint choice is exclusively trusted owner configuration; this is not an SSRF-safe public URL proxy. Use only endpoints you operate or trust.

Optional PostgreSQL source is implemented but requires `pip install 'psycopg[binary]>=3.2,<4'` in an owner-managed virtual environment. It is not needed by the static app or tests:

```json
{"id":"postgres","label":"Read-only PostgreSQL","type":"postgresql","dsnEnv":"RETAIL_PG_DSN","table":"facts"}
```

Use a least-privilege read-only account in `RETAIL_PG_DSN`. The adapter selects only normalized columns from a validated table identifier, sets a read-only transaction, uses a 10 second connection/statement timeout and fetches at most 50,001 rows before enforcing the 50,000 cap. PostgreSQL configuration/transaction behavior is mock-tested; a real warehouse has not been credential-verified.

## Exports and scheduling

```sh
python3 -m companion.runner --config companion/config.local.json run --source infra-demo
python3 -m companion.runner --config companion/config.local.json tick
python3 -m companion.runner --config companion/config.local.json scheduler
```

`run` defaults to dry-run: writes whole-source CSV, JSON snapshot, escaped HTML summary and webhook JSON payload locally. CSV formula-leading strings are prefixed with an apostrophe. `--deliver` additionally sends to a configured webhook. Server `/api/run` requires explicit `dryRun`; UI uses true. A quality warning changes outgoing type to `quality.alert`; run failures write `run.failed` payloads and log sanitized errors. With delivery explicitly enabled, failures also attempt a signed alert. No external deliveries are enabled in the example.

`serve` supports editing schedules but does **not** execute them. Run one `scheduler` process alongside it, or invoke `tick` from your operating system scheduler. Nothing runs while your machine is asleep/off. Example owner-installed cron (not installed by this project):

```cron
* * * * * cd /absolute/path/ledgerline && /usr/bin/python3 -m companion.runner --config companion/config.local.json tick >> companion/state/cron.log 2>&1
```

Due jobs atomically reserve/persist their next run **before** work; repeat ticks do not duplicate the same reservation. Intended ceiling: one scheduler runner. No distributed lease, multi-owner concurrency control, retry queue or catch-up replay. A crash after reservation can skip that run. State, replay identities, payloads and execution logs persist in SQLite; owner must back up/rotate state and exports. Network delivery has no automatic retries.

## Signed pipeline events and local webhooks

POST raw UTF-8 JSON to `/api/events`:

```json
{"eventId":"run-2026-01-01-001","type":"pipeline.failed","occurredAt":"2026-01-01T12:00:00Z","sourceId":"demo","payload":{}}
```

Allowed types: `pipeline.success`, `pipeline.failed`, `pipeline.running`. `occurredAt` needs a timezone. `X-Ledgerline-Timestamp` is the current Unix timestamp string; `X-Ledgerline-Signature` is lowercase hex HMAC-SHA256 using `eventSecret` over `timestamp + "." + rawBody`. Timestamp must be within 300 seconds; `eventId` is durably unique across restarts. Signature comparison is constant-time. Pipeline status is not fabricated when no event exists. Failure events create a local alert payload; only owner config `"deliverPipelineAlerts": true` enables outbound delivery for them.

Pipeline status follows event occurrence time in UTC, rather than delivery order. Delayed events retain their replay identities but cannot replace newer status or generate superseded failure alerts. Last successful occurrence never moves backward. At the same instant, failure takes precedence over success, and success over running; equivalent timestamps with different offsets are treated as the same instant.

SQLite warehouse reads require every normalized column to exist; missing columns fail instead of becoming literal field names. Digest runs reject non-finite aggregate totals before writing success artifacts or delivering a digest. These errors use the existing failed-run log and alert behavior.

Outbound digest/alert payloads use the same headers/algorithm and default to HTTPS destinations. Redirects are rejected. For an explicit local-only test, set `"allowLoopbackWebhook": true` and `"webhook":"http://127.0.0.1:8766"` (only literal 127.0.0.1/::1 HTTP hosts allowed). Start this receiver in another terminal:

```sh
python3 -m companion.receiver --config companion/config.local.json
python3 -m companion.runner --config companion/config.local.json run --source infra-demo --deliver
```

Receiver binds loopback, verifies freshness/signature, records accepted payloads in SQLite, and rejects repeat signed bodies. Removing `webhook` restores local exports only. Do not commit the private config or state. No live external webhook or recurring job has been activated during development.

## Hosting limits

An HTTPS-hosted static Space may block requests to an HTTP localhost companion through mixed-content/private-network policy. Use the companion-served local dashboard for working local connections. Public hosting needs a separately secured HTTPS backend, identity/authorization, operational ownership and deployment review. Owner bearer tokens are not SaaS accounts. Do not expose this Python development HTTP server directly to the internet.

Tests: `python3 -m unittest discover -s tests -p 'test*companion.py'`. Tests use temporary state, mocked semantic/PostgreSQL services and ephemeral loopback HTTP. No external messages are sent.


The reference receiver applies a 15-second socket idle timeout before request/header parsing. This is an idle deadline, not an absolute request duration: a client continuously trickling bytes can still prolong the serial loopback server. Keep it local; an exposed deployment requires ingress request limits and a reviewed server/proxy. The runner serves only explicitly allowed public startup assets, including the illustrative contract JSON; private configuration, code and state paths remain unavailable.
