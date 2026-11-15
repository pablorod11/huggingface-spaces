"""Rebuild the public, fully synthetic demo facts without dependencies."""

import csv
import math
import random
from datetime import date, timedelta
from pathlib import Path


def generate(destination=None):
    destination = Path(destination or Path(__file__).with_name("demo.csv"))
    rng = random.Random(117)
    markets = [
        ("Americas", "United States", 1.6),
        ("Americas", "Canada", 0.72),
        ("Europe", "United Kingdom", 0.9),
        ("Europe", "Germany", 0.87),
        ("Asia Pacific", "Australia", 0.65),
        ("Asia Pacific", "Japan", 0.8),
    ]
    categories = [
        ("Workspace", "Arc desk lamp", 96, 0.60),
        ("Everyday carry", "Field daypack", 74, 0.55),
        ("Home living", "Stoneware set", 128, 0.68),
    ]
    fields = [
        "id",
        "date",
        "region",
        "country",
        "channel",
        "category",
        "product",
        "revenue",
        "cost",
        "orders",
        "units",
    ]
    with destination.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        current = date(2024, 11, 1)
        index = 0
        while current <= date(2026, 10, 31):
            day = (current - date(2024, 11, 1)).days
            season = (
                1
                + 0.13 * math.sin(day / 365.25 * math.tau)
                + (0.28 if current.month == 11 else 0)
            )
            growth = 1 + day * 0.00048
            weekday = [0.90, 0.96, 1.01, 1.03, 1.16, 1.23, 0.91][current.weekday()]
            for market_index, (region, country, weight) in enumerate(markets):
                for cat_index, (category, product, price, cost_share) in enumerate(
                    categories
                ):
                    orders = max(
                        1,
                        round(
                            19
                            * weight
                            * season
                            * growth
                            * weekday
                            * rng.uniform(0.82, 1.18)
                        ),
                    )
                    # A documented synthetic campaign and shipping-cost event create useful signals.
                    if current == date(2026, 10, 14):
                        orders *= 3
                    units = round(orders * rng.uniform(1.12, 1.40))
                    revenue = round(units * price * rng.uniform(0.91, 1.05), 2)
                    cost = round(revenue * (cost_share + rng.uniform(-0.025, 0.025)), 2)
                    if (
                        current >= date(2026, 10, 19)
                        and country == "United States"
                        and category == "Home living"
                    ):
                        cost = round(revenue * 0.94, 2)
                    index += 1
                    writer.writerow(
                        dict(
                            zip(
                                fields,
                                [
                                    f"LL-{index:06}",
                                    current.isoformat(),
                                    region,
                                    country,
                                    ["Direct", "Marketplace", "Wholesale"][
                                        (day + market_index + cat_index) % 3
                                    ],
                                    category,
                                    product,
                                    revenue,
                                    cost,
                                    orders,
                                    units,
                                ],
                            )
                        )
                    )
            current += timedelta(days=1)
    return index


if __name__ == "__main__":
    print(f"Generated {generate():,} synthetic daily product-market facts.")
