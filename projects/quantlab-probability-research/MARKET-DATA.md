# Market data provenance

Generated: 2026-10-29T22:44:55Z. Requested inclusive start: 2021-10-29; exclusive end: 2026-10-29.
These are dated historical observations, never live quotes. The current day's session is excluded.

Source: Yahoo Finance public chart endpoint, `indicators.adjclose[0].adjclose`.
Each security in `market-data.json` retains its exact request URL and UTC retrieval timestamp.
Dates use the America/New_York exchange timezone. Values retain provider precision.
[Yahoo's adjustment documentation](https://in.help.yahoo.com/kb/adjusted-close-sln28256.html) describes split and cash-dividend adjustment.
Ratios of these adjusted prices approximate dividend-reinvested growth; no separate dividends are added.
Provider adjustments and corrections can revise historical values. This is not a full accounting of
taxes, commissions, slippage, dividend reinvestment execution, or inflation. Symbols are a curated
selection of current securities and are not an unbiased historical universe.

| Ticker | First session | Last session | Kept | Missing dropped | Outside range excluded | Provider bars | Retrieved UTC |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| AAPL | 2021-10-29 | 2026-10-28 | 1254 | 0 | 0 | 1254 | 2026-10-29T22:44:53Z |
| MSFT | 2021-10-29 | 2026-10-28 | 1254 | 0 | 0 | 1254 | 2026-10-29T22:44:54Z |
| NVDA | 2021-10-29 | 2026-10-28 | 1254 | 0 | 0 | 1254 | 2026-10-29T22:44:54Z |
| AMZN | 2021-10-29 | 2026-10-28 | 1254 | 0 | 0 | 1254 | 2026-10-29T22:44:54Z |
| GOOGL | 2021-10-29 | 2026-10-28 | 1254 | 0 | 0 | 1254 | 2026-10-29T22:44:54Z |
| TSLA | 2021-10-29 | 2026-10-28 | 1254 | 0 | 0 | 1254 | 2026-10-29T22:44:54Z |
| SPY | 2021-10-29 | 2026-10-28 | 1254 | 0 | 0 | 1254 | 2026-10-29T22:44:54Z |
| QQQ | 2021-10-29 | 2026-10-28 | 1254 | 0 | 0 | 1254 | 2026-10-29T22:44:55Z |

Integrity checks: aligned price/date arrays; positive finite adjusted values; strictly increasing,
unique dates; USD and requested symbol verified against provider metadata; at least 1,000 bars
per security. Null adjusted values are omitted and counted above. Unexpected non-null prices,
provider errors, or missing adjusted-price fields fail the entire refresh before replacement.
No synthetic prices, forward filling, or substitution with unadjusted closes is performed.

Refresh manually, using Python 3.9+ and its standard library (network required):

```sh
python3 scripts/refresh-market-data.py --online --as-of 2026-10-29
```

If a macOS Python installation lacks configured CA certificates, use its certificate setup or
explicitly select the system trust store with `SSL_CERT_FILE=/etc/ssl/cert.pem` before the command.
Certificate verification remains enabled; the snapshot here was retrieved using that trust store.

The end date is exclusive; choose today's New York date or an earlier date to omit incomplete
sessions. All eight requests must succeed before the snapshot is replaced atomically. Yahoo can
rate-limit or change this unofficial chart endpoint. A failed refresh leaves the previous snapshot
intact. The static browser app reads only its bundled same-origin JSON. Personal CSV files stay
in the browser and are not sent by this maintenance script.
