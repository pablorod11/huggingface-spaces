"""Infrastructure-v1 contract. Capacity-hours and costs are allocated per cohort."""

import datetime as dt
import math
import re

SCHEMA = "infrastructure-v1"
FIELDS = "id timestamp hours environment provider region tier transactions errors revenue computeCost storageCost networkCost supportCost cpuCapacityHours cpuUsedHours memoryCapacityGbHours memoryUsedGbHours storageCapacityGbHours storageUsedGbHours latencyMsSum committedCost coveredCost slaTarget".split()
LIMIT = 20 * 1024 * 1024
MAX_ROWS = 100000
COMMITMENT_INVOICE_TOLERANCE_USD = 1e-6
REGIONS = {
    "aws": ("us-east-1", "us-west-2"),
    "gcp": ("us-central1", "europe-west1"),
    "azure": ("eastus", "westeurope"),
    "equinix": ("dc2", "sv5"),
}
STRING_FIELDS = {"id", "timestamp", "environment", "provider", "region", "tier"}


def instant(value):
    if not isinstance(value, str) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value
    ):
        raise ValueError("timestamp must be YYYY-MM-DDTHH:mm:ssZ")
    return dt.datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(
        tzinfo=dt.timezone.utc
    )


def iso(value):
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


def validate_rows(rows):
    if not isinstance(rows, list) or len(rows) > MAX_ROWS:
        raise ValueError("Expected at most 100000 infrastructure rows")
    result = []
    seen = set()
    cohorts = {}
    starts = []
    ends = []
    for i, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            raise ValueError(f"Row {i}: expected object")
        out = {}
        for field in FIELDS:
            value = row.get(field)
            if field in STRING_FIELDS:
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"Row {i}: invalid {field}")
                out[field] = value
            else:
                try:
                    n = float(value)
                except (ValueError, TypeError):
                    raise ValueError(f"Row {i}: invalid {field}") from None
                if (
                    isinstance(value, bool)
                    or not math.isfinite(n)
                    or n < 0
                    or (field in ("transactions", "errors") and not n.is_integer())
                ):
                    raise ValueError(f"Row {i}: invalid {field}")
                out[field] = (
                    int(n)
                    if field in ("hours", "transactions", "errors") and n.is_integer()
                    else n
                )
        start = instant(out["timestamp"])
        if out["id"] in seen:
            raise ValueError(f"Row {i}: duplicate id")
        seen.add(out["id"])
        if (
            out["environment"] not in ("production", "staging", "development")
            or out["provider"] not in REGIONS
            or out["region"] not in REGIONS[out["provider"]]
            or out["tier"] not in ("enterprise", "growth", "free")
        ):
            raise ValueError(f"Row {i}: invalid infrastructure dimension")
        if (
            out["hours"] not in (1, 24)
            or start.minute
            or start.second
            or (out["hours"] == 24 and start.hour)
        ):
            raise ValueError(f"Row {i}: invalid interval hours/start")
        if out["errors"] > out["transactions"] or out["slaTarget"] > 1:
            raise ValueError(f"Row {i}: invalid errors or SLA target")
        for used, cap in [
            ("cpuUsedHours", "cpuCapacityHours"),
            ("memoryUsedGbHours", "memoryCapacityGbHours"),
            ("storageUsedGbHours", "storageCapacityGbHours"),
        ]:
            if out[used] > out[cap]:
                raise ValueError(f"Row {i}: {used} exceeds allocated capacity")
        if out["coveredCost"] > min(out["computeCost"], out["committedCost"]):
            raise ValueError(f"Row {i}: coveredCost exceeds eligible or committed cost")
        if out["committedCost"] > out["computeCost"] + COMMITMENT_INVOICE_TOLERANCE_USD:
            raise ValueError(f"Row {i}: committedCost exceeds the compute invoice cost")
        end = start + dt.timedelta(hours=out["hours"])
        starts.append(start)
        ends.append(end)
        key = tuple(out[k] for k in ("environment", "provider", "region", "tier"))
        cohorts.setdefault(key, []).append((start, end))
        result.append(out)
    if starts and max(ends) - min(starts) > dt.timedelta(days=2 * 365 + 7):
        raise ValueError("Infrastructure span exceeds two years plus seven days")
    for intervals in cohorts.values():
        intervals.sort()
        for previous, current in zip(intervals, intervals[1:]):
            if current[0] < previous[1]:
                raise ValueError("Overlapping infrastructure allocation intervals")
    return result


def data_through(rows):
    return max(
        (iso(instant(r["timestamp"]) + dt.timedelta(hours=r["hours"])) for r in rows),
        default=None,
    )


def summarize(rows):
    totals = {
        f: sum(r[f] for r in rows)
        for f in FIELDS
        if f not in STRING_FIELDS and f not in ("hours", "slaTarget")
    }
    ratio = lambda a, b: a / b if b else None
    percent = lambda a, b: 100 * a / b if b else None
    cost = sum(
        totals[f] for f in ("computeCost", "storageCost", "networkCost", "supportCost")
    )
    tx = totals["transactions"]
    revenue = totals["revenue"]
    target = percent(sum(r["slaTarget"] * r["transactions"] for r in rows), tx)
    success = percent(tx - totals["errors"], tx)
    totals.update(
        totalCost=cost,
        contribution=revenue - cost,
        margin=percent(revenue - cost, revenue),
        costPerTransaction=ratio(cost, tx),
        revenuePerTransaction=ratio(revenue, tx),
        successRate=success,
        avgLatencyMs=ratio(totals["latencyMsSum"], tx),
        cpuUtilization=percent(totals["cpuUsedHours"], totals["cpuCapacityHours"]),
        memoryUtilization=percent(
            totals["memoryUsedGbHours"], totals["memoryCapacityGbHours"]
        ),
        storageUtilization=percent(
            totals["storageUsedGbHours"], totals["storageCapacityGbHours"]
        ),
        commitmentUtilization=percent(totals["coveredCost"], totals["committedCost"]),
        commitmentCoverage=percent(totals["coveredCost"], totals["computeCost"]),
        slaTarget=target,
        slaMet=success >= target if tx else None,
    )
    totals["peakCpuUtilization"] = max(
        (
            100 * r["cpuUsedHours"] / r["cpuCapacityHours"]
            for r in rows
            if r["cpuCapacityHours"]
        ),
        default=None,
    )
    totals["saturatedIntervals"] = sum(
        1
        for r in rows
        if r["cpuCapacityHours"] and r["cpuUsedHours"] / r["cpuCapacityHours"] >= 0.85
    )
    totals["headroom"] = (
        100 - totals["cpuUtilization"] if totals["cpuUtilization"] is not None else None
    )
    return totals


def quality(rows, mode="live", now=None, fetchedAt=None):
    validate_rows(rows)
    checks = [
        dict(id=key, label=label, status="pass", affected=0, message=message)
        for key, label, message in [
            ("schema", "Schema", "Infrastructure-v1 fields and dimensions valid"),
            (
                "numericcapacity",
                "Allocated capacity",
                "Finite nonnegative metrics, allocated usage and commitment bounds valid",
            ),
            (
                "allocation",
                "Allocation intervals",
                "No overlapping intervals within an environment/provider/region/tier",
            ),
        ]
    ]
    through = data_through(rows)
    current = now or dt.datetime.now(dt.timezone.utc)
    if isinstance(current, str):
        current = instant(current)
    stale = (
        not through
        or current - instant(through) > dt.timedelta(days=7)
        or instant(through) > current + dt.timedelta(minutes=5)
    )
    if fetchedAt:
        try:
            fetched = dt.datetime.fromisoformat(fetchedAt.replace("Z", "+00:00"))
            if fetched.tzinfo is None:
                raise ValueError("Fetch timestamp requires timezone")
            stale = (
                stale
                or current - fetched > dt.timedelta(days=1)
                or fetched > current + dt.timedelta(minutes=5)
            )
        except (ValueError, TypeError, AttributeError):
            stale = True
    checks.append(
        dict(
            id="freshness",
            label="Freshness",
            status="info" if mode == "demo" else ("warn" if stale else "pass"),
            affected=len(rows) if stale and mode != "demo" else 0,
            message=(
                "Fixed historical demonstration; not a live freshness assertion"
                if mode == "demo"
                else "Source interval end and optional fetch timestamp checked against UTC: 7 days for data, 24 hours for fetch, 5 minutes future tolerance"
            ),
        )
    )
    return checks
