#!/usr/bin/env python3
"""Explicit maintenance task; the browser app never calls this network script."""

import argparse
import calendar
import datetime as dt
import json
import math
import os
from pathlib import Path
import tempfile
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

TICKERS = ("AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "TSLA", "SPY", "QQQ")
ADJUSTMENT = "Yahoo Finance adjusted close: adjusted for stock splits and cash dividends"
ADJUSTMENT_URL = "https://in.help.yahoo.com/kb/adjusted-close-sln28256.html"
NY = ZoneInfo("America/New_York")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def epoch(day):
    return int(dt.datetime.combine(day, dt.time(), dt.timezone.utc).timestamp())


def retrieve(ticker, start, end):
    query = urllib.parse.urlencode({"period1": epoch(start), "period2": epoch(end),
                                  "interval": "1d", "events": "div,splits"})
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=40) as response:
        payload = json.load(response)
    retrieved_at = now()
    chart = payload["chart"]
    if chart.get("error") or not chart.get("result"):
        raise ValueError(f"{ticker}: provider did not return chart data")
    data = chart["result"][0]
    if data["meta"].get("symbol") != ticker or data["meta"].get("currency") != "USD":
        raise ValueError(f"{ticker}: unexpected symbol or currency")
    timestamps = data["timestamp"]
    adjusted = data["indicators"]["adjclose"][0]["adjclose"]
    if len(timestamps) != len(adjusted):
        raise ValueError(f"{ticker}: unaligned observations")
    dates, closes = [], []
    missing, excluded = 0, 0
    for timestamp, close in zip(timestamps, adjusted):
        day = dt.datetime.fromtimestamp(timestamp, NY).date()
        if not start <= day < end:
            excluded += 1
            continue
        if close is None:
            missing += 1
            continue
        if isinstance(close, bool) or not isinstance(close, (int, float)) or not math.isfinite(close) or close <= 0:
            raise ValueError(f"{ticker}: invalid adjusted price on {day}")
        label = day.isoformat()
        if dates and label <= dates[-1]:
            raise ValueError(f"{ticker}: dates are not strictly increasing")
        dates.append(label)
        closes.append(close)
    if len(dates) < 1000:
        raise ValueError(f"{ticker}: insufficient observations ({len(dates)})")
    result = {"ticker": ticker, "name": data["meta"].get("longName", ticker), "currency": "USD",
              "sourceUrl": url, "adjustment": ADJUSTMENT, "retrievedAt": retrieved_at,
              "dates": dates, "closes": closes}
    return result, missing, excluded, len(timestamps)


def atomic_write(path, text):
    handle, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(handle, "w") as stream:
            stream.write(text)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--online", action="store_true", help="explicitly permit requests to Yahoo Finance")
    parser.add_argument("--as-of", required=True, type=dt.date.fromisoformat,
                        help="exclusive ISO date; only earlier daily sessions are included")
    args = parser.parse_args()
    if not args.online:
        parser.error("network retrieval requires --online")
    if args.as_of > dt.datetime.now(NY).date():
        parser.error("--as-of cannot be later than today's New York date")
    # Five calendar years; February 29 maps to February 28 when necessary.
    start_year = args.as_of.year - 5
    start = args.as_of.replace(year=start_year,
                              day=min(args.as_of.day, calendar.monthrange(start_year, args.as_of.month)[1]))
    securities, rows = [], []
    for ticker in TICKERS:
        series, missing, excluded, returned = retrieve(ticker, start, args.as_of)
        securities.append(series)
        rows.append(f"| {ticker} | {series['dates'][0]} | {series['dates'][-1]} | {len(series['dates'])} | {missing} | {excluded} | {returned} | {series['retrievedAt']} |")
        print(f"{ticker}: {len(series['dates'])} observations; {series['dates'][0]} to {series['dates'][-1]}; missing {missing}; excluded {excluded}")
    generated = now()
    result = {"schemaVersion": 1, "generatedAt": generated,
              "source": {"name": "Yahoo Finance chart API (dated daily snapshot)",
                         "url": "https://finance.yahoo.com/", "adjustment": ADJUSTMENT, "currency": "USD"},
              "securities": securities}
    root = Path(__file__).resolve().parent.parent
    report = f"""# Market data provenance

Generated: {generated}. Requested inclusive start: {start}; exclusive end: {args.as_of}.
These are dated historical observations, never live quotes. The current day's session is excluded.

Source: Yahoo Finance public chart endpoint, `indicators.adjclose[0].adjclose`.
Each security in `market-data.json` retains its exact request URL and UTC retrieval timestamp.
Dates use the America/New_York exchange timezone. Values retain provider precision.
[Yahoo's adjustment documentation]({ADJUSTMENT_URL}) describes split and cash-dividend adjustment.
Ratios of these adjusted prices approximate dividend-reinvested growth; no separate dividends are added.
Provider adjustments and corrections can revise historical values. This is not a full accounting of
taxes, commissions, slippage, dividend reinvestment execution, or inflation. Symbols are a curated
selection of current securities and are not an unbiased historical universe.

| Ticker | First session | Last session | Kept | Missing dropped | Outside range excluded | Provider bars | Retrieved UTC |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
{chr(10).join(rows)}

Integrity checks: aligned price/date arrays; positive finite adjusted values; strictly increasing,
unique dates; USD and requested symbol verified against provider metadata; at least 1,000 bars
per security. Null adjusted values are omitted and counted above. Unexpected non-null prices,
provider errors, or missing adjusted-price fields fail the entire refresh before replacement.
No synthetic prices, forward filling, or substitution with unadjusted closes is performed.

Refresh manually, using Python 3.9+ and its standard library (network required):

```sh
python3 scripts/refresh-market-data.py --online --as-of {args.as_of}
```

If a macOS Python installation lacks configured CA certificates, use its certificate setup or
explicitly select the system trust store with `SSL_CERT_FILE=/etc/ssl/cert.pem` before the command.
Certificate verification remains enabled; the snapshot here was retrieved using that trust store.

The end date is exclusive; choose today's New York date or an earlier date to omit incomplete
sessions. All eight requests must succeed before the snapshot is replaced atomically. Yahoo can
rate-limit or change this unofficial chart endpoint. A failed refresh leaves the previous snapshot
intact. The static browser app reads only its bundled same-origin JSON. Personal CSV files stay
in the browser and are not sent by this maintenance script.
"""
    atomic_write(root / "market-data.json", json.dumps(result, separators=(",", ":"), allow_nan=False) + "\n")
    atomic_write(root / "MARKET-DATA.md", report)


if __name__ == "__main__":
    main()
