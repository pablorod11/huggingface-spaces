"""Deterministic synthetic infrastructure ledger. No external pricing or contracts.
All capacity-hours are allocated once to environment/region/tier cohorts.
computeCost includes prepaid budget plus usage not covered by that budget.
"""

import csv
import datetime as dt
import json
import math
import random
from pathlib import Path

FIELDS = "id,timestamp,hours,environment,provider,region,tier,transactions,errors,revenue,computeCost,storageCost,networkCost,supportCost,cpuCapacityHours,cpuUsedHours,memoryCapacityGbHours,memoryUsedGbHours,storageCapacityGbHours,storageUsedGbHours,latencyMsSum,committedCost,coveredCost,slaTarget".split(
    ","
)
PROVIDERS = {
    "aws": ["us-east-1", "us-west-2"],
    "gcp": ["us-central1", "europe-west1"],
    "azure": ["eastus", "westeurope"],
    "equinix": ["dc2", "sv5"],
}
START = dt.datetime(2024, 11, 3, tzinfo=dt.timezone.utc)
END = dt.datetime(2026, 11, 3, tzinfo=dt.timezone.utc)
HOURLY = END - dt.timedelta(days=1)


def generate():
    rng = random.Random(73104)
    rows = []
    time = START
    while time < END:
        hours = 1 if time >= HOURLY else 24
        day = (time - START).total_seconds() / 86400
        growth = 1 + day / 730 * 0.55
        weekly = 1 + 0.065 * math.cos(2 * math.pi * time.weekday() / 7)
        diurnal = (
            1 + 0.10 * math.cos(2 * math.pi * (time.hour - 16) / 24)
            if hours == 1
            else 1
        )
        for pi, (provider, regions) in enumerate(PROVIDERS.items()):
            for ri, region in enumerate(regions):
                for ei, environment in enumerate(
                    ["production", "staging", "development"]
                ):
                    for ti, tier in enumerate(["enterprise", "growth", "free"]):
                        # Tier shares sum to one; no whole-host capacity duplicated by tier.
                        allocation = [0.52, 0.34, 0.14][ti]
                        envscale = [1, 0.14, 0.08][ei]
                        region_cpu = (
                            [28, 19, 16, 12][pi] * (1 if ri == 0 else 0.68) * envscale
                        )
                        fleet_expansion = 1 + 0.30 * math.floor(day / 120) / 6
                        cpu = region_cpu * allocation * fleet_expansion * hours
                        memory = cpu * [4, 4.5, 4.2, 5][pi]
                        storage = cpu * [35, 40, 38, 55][pi]
                        utilization = min(
                            0.88,
                            max(
                                0.18,
                                (0.46 + 0.05 * ti - 0.065 * ei)
                                * growth
                                / fleet_expansion
                                * weekly
                                * diurnal
                                + rng.uniform(-0.018, 0.018),
                            ),
                        )
                        incident = (
                            environment == "production"
                            and provider == "aws"
                            and region == "us-east-1"
                            and time >= END - dt.timedelta(days=3)
                        )
                        if incident:
                            utilization = (
                                0.948
                                + 0.012 * math.sin(time.hour / 24 * 2 * math.pi)
                                + rng.uniform(-0.003, 0.003)
                            )
                        cpuused = cpu * utilization
                        memoryused = memory * min(
                            0.94, 0.42 + utilization * 0.39 + 0.035 * ti
                        )
                        storageused = storage * (0.37 + 0.22 * day / 730 + 0.025 * ti)
                        transactions = max(
                            0,
                            round(
                                cpuused
                                * [870, 960, 1100][ti]
                                * (1 if ei == 0 else 0.20)
                                * rng.uniform(0.97, 1.03)
                            ),
                        )
                        errorrate = (0.00025 + 0.00015 * ti + 0.00015 * ei) * (
                            1 + rng.random() * 0.3
                        )
                        if incident:
                            errorrate = 0.009 + 0.003 * rng.random()
                        errors = round(transactions * errorrate)
                        revenue = (
                            transactions * [0.0032, 0.0024, 0][ti] if ei == 0 else 0
                        )
                        # Synthetic effective per-vCPU-hour units, never vendor list prices.
                        eligible = (
                            cpu
                            * (0.024 + 0.024 * utilization)
                            * [1, 1.04, 1.08, 0.83][pi]
                        )
                        committed = (
                            cpu
                            * 0.043
                            * [1, 1.04, 1.08, 0.83][pi]
                            * [0.88, 0.76, 0.40][ti]
                        )
                        covered = min(eligible, committed)
                        noneligible = cpu * 0.006
                        compute = committed + max(eligible - committed, 0) + noneligible
                        storagecost = storage * 0.000022
                        networkcost = transactions * 0.000018 * (1.1 if ri else 1)
                        supportcost = (compute + storagecost + networkcost) * 0.075
                        latency = (
                            38
                            + utilization * 45
                            + ti * 4
                            + (95 if incident else 0)
                            + rng.uniform(-3, 3)
                        )
                        values = [
                            f"{time:%Y%m%d%H}-{provider}-{ri}-{ei}-{ti}",
                            time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                            hours,
                            environment,
                            provider,
                            region,
                            tier,
                            transactions,
                            errors,
                            revenue,
                            compute,
                            storagecost,
                            networkcost,
                            supportcost,
                            cpu,
                            cpuused,
                            memory,
                            memoryused,
                            storage,
                            storageused,
                            transactions * latency,
                            committed,
                            covered,
                            [0.999, 0.998, 0.995][ti],
                        ]
                        rows.append(
                            dict(
                                zip(
                                    FIELDS,
                                    [
                                        round(v, 6) if isinstance(v, float) else v
                                        for v in values
                                    ],
                                )
                            )
                        )
        time += dt.timedelta(hours=hours)
    return rows


def main():
    path = Path(__file__).resolve().parent
    rows = generate()
    with (path / "infrastructure.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    recent = [r for r in rows if r["timestamp"] >= "2026-10-04T00:00:00Z"]
    totals = {
        k: round(sum(r[k] for r in recent), 6)
        for k in FIELDS
        if k
        not in [
            "id",
            "timestamp",
            "hours",
            "environment",
            "provider",
            "region",
            "tier",
            "slaTarget",
        ]
    }
    totals["totalCost"] = round(
        sum(
            totals[k]
            for k in ["computeCost", "storageCost", "networkCost", "supportCost"]
        ),
        6,
    )
    totals["contribution"] = round(totals["revenue"] - totals["totalCost"], 6)
    totals["cpuUtilization"] = 100 * totals["cpuUsedHours"] / totals["cpuCapacityHours"]
    meta = {
        "schemaVersion": "infrastructure-v1",
        "seed": 73104,
        "synthetic": True,
        "currency": "USD",
        "timezone": "UTC",
        "start": START.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endExclusive": END.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "resolution": "Daily history; last 24 hours hourly. No overlapping intervals.",
        "rows": len(rows),
        "cohortsPerInterval": 72,
        "csvBytes": (path / "infrastructure.csv").stat().st_size,
        "costSemantics": "Compute cost includes allocated prepaid commitment budget plus uncovered eligible and noneligible usage. Do not add committedCost again. Synthetic illustrative units, budgets and SLA targets; no current vendor pricing or contracts.",
        "capacitySemantics": "Capacity-hours allocated once across tiers, environments and regions. Weighted utilization = summed used / summed capacity.",
        "incident": "Illustrative production AWS us-east-1 cohort pressure in last three days; synthetic, not an actual provider outage.",
        "last30Days": totals,
    }
    (path / "infrastructure-metrics.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(
        json.dumps({k: meta[k] for k in ["rows", "csvBytes", "start", "endExclusive"]})
    )


if __name__ == "__main__":
    main()
