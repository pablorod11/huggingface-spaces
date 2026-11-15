# Infrastructure facts and formulas

Schema version: `infrastructure-v1`. Currency: USD. All timestamps use UTC. A fact is one non-overlapping environment/provider/region/tier interval. Tiers receive allocated capacities and costs; shared pool capacity is not copied in full into every tenant tier.

## Fields

| Fields | Meaning |
|---|---|
| id | Globally unique source fact identifier |
| timestamp, hours | Interval start ISO UTC timestamp and duration (1 hour or 24 hours); daily intervals begin at midnight |
| environment | production, staging, development |
| provider, region | aws/us-east-1 or us-west-2; gcp/us-central1 or europe-west1; azure/eastus or westeurope; equinix/dc2 or sv5 |
| tier | enterprise, growth, free |
| transactions, errors | Non-overlapping request counts; errors cannot exceed transactions |
| revenue | Attributed revenue for the interval and selected cohort |
| computeCost, storageCost, networkCost, supportCost | Fully allocated invoice cost components; no currency conversion |
| cpuCapacityHours, cpuUsedHours | Allocated available and consumed CPU core-hours |
| memoryCapacityGbHours, memoryUsedGbHours | Allocated available and consumed memory GB-hours |
| storageCapacityGbHours, storageUsedGbHours | Allocated available and consumed storage GB-hours |
| latencyMsSum | Sum of response latency in milliseconds across transactions |
| committedCost | Prepaid compute commitment budget allocated to the interval/cohort |
| coveredCost | Eligible usage applied against that budget; cannot exceed commitment or billed compute |
| slaTarget | Target successful-transaction fraction from 0 to 1 |

Imports validate strings, enums, provider-region membership, unique IDs, finite nonnegative numbers, counts, capacity bounds, interval duration and non-overlap. Limits: 100,000 rows, 20 MB CSV, and a source span no longer than two years plus seven days. No private dataset is bundled. Do not include personal customer information in public repository files.

## Aggregation

All costs, revenue, counts and resource-hours sum over the selected facts. Rates derive from the summed numerator and denominator:

- Total infrastructure cost = compute + storage + network + support.
- Contribution = revenue − total infrastructure cost.
- Contribution margin = 100 × contribution / revenue.
- Cost per transaction = total cost / transactions.
- Revenue per transaction = revenue / transactions.
- Success rate = 100 × (transactions − errors) / transactions.
- Average latency = latencyMsSum / transactions.
- CPU utilization = 100 × CPU used hours / CPU available hours. Memory and storage use their own equivalent denominators.
- CPU headroom = 100 − weighted CPU utilization.
- Commitment utilization = 100 × covered cost / committed cost.
- Commitment coverage = 100 × covered cost / compute invoice cost.
- Target success rate = 100 × transaction-weighted mean of input target fractions.

Undefined ratios are null, displayed as a dash. Free-tier or non-production revenue may legitimately be zero while infrastructure costs remain positive; no percentage margin is fabricated. Counts belong to this aggregate grain and must not be repeated across facts. The app does not infer unique tenant counts from segment labels.

Compute invoice cost already includes the commitment budget, including unused prepaid capacity, plus uncovered/other eligible spend. Both JavaScript and Python reject committedCost greater than computeCost plus an absolute USD 0.000001 rounding tolerance; the tolerance is not an extra charge. Never add committedCost again to totalCost. Coverage denominators refer to the explicit normalized compute invoice field; they are not universal vendor billing definitions.

## Mixed resolution

The reproducible source has two years of history. Older periods are daily, and the latest day has 24 separate hourly intervals. No day is represented by both daily and hourly rows. Partial-interval slicing scales additive fields by overlap duration, which assumes uniform activity within that interval. Scenario expected request counts may also be fractional; source counts themselves remain integers.

Observed peak utilization is a maximum across reported allocated-cohort intervals. Daily aggregates cannot establish intra-day spikes or individual host behavior. Empty time buckets are not silently treated as successful service or available capacity. Inspect timestamp coverage before interpreting a comparison.

## Scenarios and estimates

Projected utilization scales current usage by demand growth and efficiency assumptions and scales capacity by the capacity change input. The CPU planning target is 75%. Scenario inputs are independent and do not model workload placement, queues, bottleneck coupling, procurement lead times or causal demand elasticity. Forecasts use a documented statistical baseline; uncertainty bands are illustrative rather than calibrated guarantees.

## Companion sources

New sources explicitly set `schema: "infrastructure-v1"`. Configured SQLite/PostgreSQL read-only fixed-column queries or a normalized semantic HTTPS endpoint must return these fields. Snapshot metadata includes `schemaVersion`. Source IDs map to trusted owner configuration; browser callers cannot submit SQL, remote destination URLs or server paths. Existing schema-default retail sources are retained for compatibility and cannot be analyzed as infrastructure facts without a mapping.

## Analysis exports

Filtered CSV exports reproduce the analytical slice. Partial intervals may contain prorated duration and fractional request estimates, so such exports are not strict raw-source inputs. Preserve and reimport the original source for future analysis; do not round estimates to force them into source validation.
