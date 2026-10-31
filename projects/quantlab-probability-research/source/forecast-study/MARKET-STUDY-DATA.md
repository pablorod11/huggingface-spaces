# Separate forecast research market snapshot

Generated UTC: 2026-10-29T23:00:24Z. Requested start inclusive: 2018-10-29; end exclusive: 2026-10-29.
Research-only source, separate from production `market-data.json`. Eight calendar years of
adjusted historical daily prices, with current day excluded. Never live quotes.

Source: Yahoo Finance chart API; each security retains its exact query URL and UTC retrieval
instant. Values are directly from `indicators.adjclose[0].adjclose`; dates are exchange-local
America/New_York calendar dates. No price rounding, interpolation, or synthetic data.
[Yahoo adjustment documentation](https://in.help.yahoo.com/kb/adjusted-close-sln28256.html) describes stock-split and cash-dividend
adjustments. Historical adjustments may be revised by the provider. Ratios approximate
reinvested growth; no separate dividend is added. Taxes, fees and slippage are not represented.

| Ticker | First session | Last session | Price observations | Prices before final 200 | Null dropped | Outside range excluded | Provider bars | Retrieved UTC | Raw response SHA-256 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| AAPL | 2018-10-29 | 2026-10-28 | 2010 | 1810 | 0 | 0 | 2010 | 2026-10-29T23:00:22Z | `da59aed4177acd18ce5ab3ad7b136ccbe2e3fdb4d0291caa2c45ae17e384dba4` |
| MSFT | 2018-10-29 | 2026-10-28 | 2010 | 1810 | 0 | 0 | 2010 | 2026-10-29T23:00:23Z | `f86b6579e7fe2c9cf3b21a27bd0a934aa7ca9b6968bfde1561d68c112c37b58b` |
| NVDA | 2018-10-29 | 2026-10-28 | 2010 | 1810 | 0 | 0 | 2010 | 2026-10-29T23:00:23Z | `80018a775a759661e36d64a5d8632afa1ea2decc6ef737b44016a70f5674f32d` |
| AMZN | 2018-10-29 | 2026-10-28 | 2010 | 1810 | 0 | 0 | 2010 | 2026-10-29T23:00:23Z | `c19bf891542a4c22890c5e7f4115db942b778ae651dd0af437948e9eb7c00017` |
| GOOGL | 2018-10-29 | 2026-10-28 | 2010 | 1810 | 0 | 0 | 2010 | 2026-10-29T23:00:23Z | `f7bdb191f454de8383cee078cbaf8691ba0350dd5ec8f262cf8949dfc70a23b5` |
| TSLA | 2018-10-29 | 2026-10-28 | 2010 | 1810 | 0 | 0 | 2010 | 2026-10-29T23:00:23Z | `e77cea8c2e4b233ff9b11acbc0361f00323308d13ad04fe48419310688908a92` |
| SPY | 2018-10-29 | 2026-10-28 | 2010 | 1810 | 0 | 0 | 2010 | 2026-10-29T23:00:24Z | `0f2eb93817c3d090ef25942959858065281f048584105030909369a32247182e` |
| QQQ | 2018-10-29 | 2026-10-28 | 2010 | 1810 | 0 | 0 | 2010 | 2026-10-29T23:00:24Z | `96f7aa47a9bc1d5012c9b0fd8db9c5c93f3cc7aead537006257c064e7b0126e0` |

Snapshot file SHA-256: `65274ad093af61057fe71e70f9aea647d68e756aecb67a2c4ab4507abb2ebbbe`.
Raw response hashes refer to the exact full HTTPS payload bytes parsed for each series, prior
to selecting adjusted closes. Request URLs are stored per security in the JSON. Raw payloads
were not persisted. Download used Python standard library urllib with system certificate trust
store (`SSL_CERT_FILE=/etc/ssl/cert.pem`), with TLS verification enabled and a browser user agent.

Verification: provider symbol and USD currency match each requested ticker; arrays align;
prices are finite and positive; unique dates strictly increase and lie within requested range;
each series contains at least 1,264 and no more than 2,500 price observations. Null values would
be omitted and counted above; no non-null invalid values are accepted.

Only metadata, dates, lengths and per-value validity were inspected. No returns, forecasts,
method scores, or investment outcomes were computed, including for the final 200 observations.
Removing the final 200 prices leaves the count in the table; returns have one fewer observation
than prices. Holdout policy and any development/confirmation split are for the parent workflow.
These are eight selected currently traded tickers, not an unbiased historical universe.
