import test from "node:test";
import assert from "node:assert/strict";
import * as a from "../src/analytics.js";
const row = (extra = {}) => ({
  id: "1",
  date: "2024-02-29",
  region: "East",
  country: "US",
  channel: "Web",
  category: "Home",
  product: "Lamp",
  revenue: 100,
  cost: 60,
  orders: 2,
  units: 3,
  ...extra,
});
const header =
  "id,date,region,country,channel,category,product,revenue,cost,orders,units";
const series = (n, fn = () => 100) =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.UTC(2024, 0, i + 1)).toISOString().slice(0, 10),
    revenue: fn(i),
  }));
test("CSV parses quoted delimiters and newlines, normalizes numeric facts", () => {
  const rows = a.parseCSV(
    header +
      '\r\n1,2024-02-29,East,US,Web,Home,"Lamp, \"\"large\"\"\nwhite",100,60,2,3\r\n',
  );
  assert.equal(rows[0].product, 'Lamp, "large"\nwhite');
  assert.equal(rows[0].revenue, 100);
});
test("CSV rejects malformed structure, numeric blanks and invalid dates", () => {
  for (const text of [
    header + "\n1,2024-02-30,East,US,Web,Home,Lamp,100,60,2,3",
    header + "\n1,2024-02-29,East,US,Web,Home,Lamp,,60,2,3",
    header + '\n"unterminated',
    header + "\n1,2",
  ])
    assert.throws(() => a.parseCSV(text), /row|CSV|date|revenue/i);
});
test("validation flags duplicates, negative, missing and wrong types without mutation", () => {
  const input = [row(), row({ cost: -1, orders: 1.5, region: "", units: "3" })];
  const before = JSON.stringify(input);
  const result = a.validateRows(input);
  assert.equal(result.valid, false);
  for (const field of ["id", "cost", "orders", "region", "units"])
    assert.ok(result.errors.some((e) => e.field === field));
  assert.equal(JSON.stringify(input), before);
  assert.equal(a.validateRows([]).valid, true);
});
test("CSV exports neutralize formulas and preserve escaped text", () => {
  const text = a.csvExport([
    row({ product: "=SUM(A1:A2)", country: '"US"', region: "\t+1" }),
  ]);
  assert.match(text, /'=SUM/);
  assert.match(text, /'\t\+1/);
  assert.equal(a.parseCSV(text)[0].country, '"US"');
});
test("date presets anchor to source max in UTC across leap boundaries", () => {
  const rows = [row({ date: "2023-01-01" }), row({ date: "2024-03-01" })];
  assert.deepEqual(a.dateWindow(rows, "30d"), {
    start: "2024-02-01",
    end: "2024-03-01",
  });
  assert.deepEqual(a.dateWindow(rows, "qtd"), {
    start: "2024-01-01",
    end: "2024-03-01",
  });
  assert.deepEqual(a.dateWindow(rows, "mtd"), {
    start: "2024-03-01",
    end: "2024-03-01",
  });
  assert.deepEqual(a.dateWindow(rows, "all"), {
    start: "2023-01-01",
    end: "2024-03-01",
  });
  assert.deepEqual(a.dateWindow([], "all"), { start: null, end: null });
  assert.throws(() => a.dateWindow(rows, "custom", "2024-03-01", "2024-02-01"));
});
test("comparison is inclusive and prior-year leap clamped", () => {
  assert.deepEqual(
    a.comparisonWindow({ start: "2024-02-28", end: "2024-03-01" }, "previous"),
    { start: "2024-02-25", end: "2024-02-27" },
  );
  assert.deepEqual(
    a.comparisonWindow({ start: "2024-02-29", end: "2024-03-01" }, "year"),
    { start: "2023-02-28", end: "2023-03-01" },
  );
});
test("filters combine dimensions and inclusive dates", () => {
  const rows = [
    row(),
    row({ id: "2", region: "West" }),
    row({ id: "3", date: "2024-03-01" }),
  ];
  assert.deepEqual(
    a.filterRows(rows, {
      start: "2024-02-29",
      end: "2024-02-29",
      filters: { region: ["East"], country: ["US"] },
    }),
    [rows[0]],
  );
});
test("summary uses weighted ratios and explicit nulls at zero", () => {
  assert.deepEqual(
    a.summarize([
      row(),
      row({ id: "2", revenue: 300, cost: 200, orders: 3, units: 4 }),
    ]),
    {
      revenue: 400,
      cost: 260,
      profit: 140,
      margin: 35,
      orders: 5,
      units: 7,
      aov: 80,
    },
  );
  assert.deepEqual(a.summarize([]), {
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: null,
    orders: 0,
    units: 0,
    aov: null,
  });
});
test("grouping ranks revenue without prototype-key collisions", () => {
  const groups = a.groupBy(
    [
      row({ region: "__proto__" }),
      row({ id: "2", region: "West", revenue: 200 }),
    ],
    "region",
  );
  assert.equal(groups[0].key, "West");
  assert.equal(groups[1].revenue, 100);
});
test("daily series aggregates duplicates and zero fills missing days", () => {
  assert.deepEqual(
    a
      .dailySeries([
        row({ date: "2024-03-01" }),
        row({ id: "2", date: "2024-02-28" }),
      ])
      .map((x) => [x.date, x.revenue]),
    [
      ["2024-02-28", 100],
      ["2024-02-29", 0],
      ["2024-03-01", 100],
    ],
  );
  assert.deepEqual(a.dailySeries([]), []);
});
test("anomaly baseline uses only earlier history and flags known spike", () => {
  const first = series(15, (i) => (i === 14 ? 1000 : 100));
  const detected = a.detectAnomalies(first);
  assert.equal(detected[0].date, "2024-01-15");
  assert.equal(detected[0].expected, 100);
  assert.equal(detected[0].direction, "up");
  assert.deepEqual(
    a
      .detectAnomalies(
        first.concat(
          series(20).map((x, i) => ({
            ...x,
            date: new Date(Date.UTC(2024, 0, 16 + i))
              .toISOString()
              .slice(0, 10),
            revenue: 10000,
          })),
        ),
      )
      .filter((x) => x.date === "2024-01-15"),
    detected,
  );
  assert.deepEqual(a.detectAnomalies(series(14)), []);
});
test("forecast abstains on short history and returns future-only bounded points", () => {
  assert.equal(a.forecast(series(10)).points.length, 0);
  const result = a.forecast(series(70), 14);
  assert.equal(result.points.length, 14);
  assert.equal(result.points[0].date, "2024-03-11");
  assert.equal(result.points[0].value, 100);
  assert.equal(result.backtestMape, 0);
  assert.ok(
    result.points.every((p) => p.lower <= p.value && p.value <= p.upper),
  );
  assert.match(result.method, /illustrative/i);
});
test("forecast holdout is truly unseen, including abrupt validation change", () => {
  const result = a.forecast(
    series(70, (i) => (i < 56 ? 100 : 200)),
    14,
  );
  assert.ok(result.backtestMape >= 49 && result.backtestMape <= 51);
});
test("scenario applies independent price volume cost and fixed expense arithmetic", () => {
  const input = a.summarize([row()]);
  const result = a.simulate(input, {
    price: 10,
    volume: 20,
    cost: 5,
    fixed: 10,
  });
  assert.ok(Math.abs(result.revenue - 132) < 1e-9);
  assert.ok(Math.abs(result.cost - 85.6) < 1e-9);
  assert.ok(Math.abs(result.profit - 46.4) < 1e-9);
  assert.equal(input.revenue, 100);
  assert.equal(a.simulate(a.summarize([]), {}).margin, null);
});
test("quality distinguishes historical demo from stale live data and reports invalid rows", () => {
  const options = {
    now: "2025-01-01T00:00:00Z",
    fetchedAt: "2024-01-01T00:00:00Z",
  };
  const demo = a.qualityChecks([row()], { ...options, mode: "demo" });
  const live = a.qualityChecks([row()], { ...options, mode: "live" });
  assert.equal(demo.find((x) => x.id === "freshness").status, "pass");
  assert.equal(live.find((x) => x.id === "freshness").status, "warn");
  assert.ok(
    a.qualityChecks([row({ date: "no" })]).some((x) => x.status === "fail"),
  );
  assert.ok(a.qualityChecks([]).some((x) => x.status === "warn"));
});
test("insights ground conclusions in totals without fabricating zero-baseline growth", () => {
  const result = a.insights([row()], [row({ revenue: 0, cost: 0 })]);
  assert.ok(result.length > 0);
  assert.ok(result.every((x) => x.title && x.body && x.severity));
  assert.ok(!JSON.stringify(result).match(/Infinity|NaN/));
  assert.deepEqual(a.insights([]), []);
});
test("CSV enforces byte and row bounds and unique required headers", () => {
  assert.throws(() => a.parseCSV("x".repeat(5 * 1024 * 1024 + 1)), /5 MB/);
  assert.throws(() => a.parseCSV(header + ",id\n"), /header/);
  assert.throws(() => a.parseCSV("id,date\n1,2024-01-01"), /header/);
  assert.throws(() => a.parseCSV(""), /empty/);
  assert.equal(
    a.validateRows(
      Array.from({ length: 50001 }, (_, i) => row({ id: String(i) })),
    ).valid,
    false,
  );
});
test("date boundaries cover year rollover, quarter start, leap year and zero window", () => {
  const rows = [row({ date: "2024-01-01" })];
  assert.deepEqual(a.dateWindow(rows, "90d"), {
    start: "2023-10-04",
    end: "2024-01-01",
  });
  assert.deepEqual(a.dateWindow(rows, "ytd"), {
    start: "2024-01-01",
    end: "2024-01-01",
  });
  assert.deepEqual(a.dateWindow([row({ date: "2024-07-09" })], "qtd"), {
    start: "2024-07-01",
    end: "2024-07-09",
  });
  assert.deepEqual(
    a.comparisonWindow({ start: "2024-02-29", end: "2024-02-29" }, "year"),
    { start: "2023-02-28", end: "2023-02-28" },
  );
  assert.deepEqual(a.comparisonWindow({ start: null, end: null }, "previous"), {
    start: null,
    end: null,
  });
  assert.throws(() => a.dateWindow(rows, "custom", "2024-02-30", "2024-03-01"));
});
test("zero actuals do not fabricate MAPE; forecast rejects discontinuous history", () => {
  const result = a.forecast(series(70, () => 0));
  assert.equal(result.backtestMape, null);
  assert.ok(
    result.points.every((p) => p.value === 0 && p.lower === 0 && p.upper === 0),
  );
  assert.equal(
    a.forecast(series(70).filter((_, i) => i !== 40)).points.length,
    0,
  );
  assert.throws(() => a.forecast(series(70), 91), /horizon/);
});
test("scenario handles complete demand loss and refuses impossible negative prices", () => {
  const result = a.simulate(a.summarize([row()]), { volume: -100, fixed: 10 });
  assert.deepEqual(result, {
    revenue: 0,
    cost: 10,
    profit: -10,
    margin: null,
    orders: 0,
    units: 0,
    aov: null,
  });
  assert.throws(() => a.simulate(a.summarize([row()]), { price: -101 }));
});
test("pure aggregations support frozen input and preserve fact order", () => {
  const rows = Object.freeze([
    Object.freeze(row({ date: "2024-03-02" })),
    Object.freeze(row({ id: "2", date: "2024-02-29" })),
  ]);
  a.dateWindow(rows, "all");
  a.groupBy(rows, "region");
  a.dailySeries(rows);
  a.summarize(rows);
  a.insights(rows);
  assert.equal(rows[0].date, "2024-03-02");
});
test("validation rejects sparse millennia before date expansion", () => {
  const rows = [
    row({ date: "0001-01-01" }),
    row({ id: "2", date: "9999-12-31" }),
  ];
  const result = a.validateRows(rows);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(
      (e) => e.field === "date" && /7,?310|20 years/.test(e.message),
    ),
  );
  assert.throws(
    () => a.parseCSV(a.csvExport(rows)),
    /date.*7,?310|date.*20 years/i,
  );
});
test("daily series enforces the documented date span before allocating", () => {
  const allowed = [
    row({ date: "2000-01-01" }),
    row({ id: "2", date: "2020-01-06" }),
  ];
  assert.equal(a.validateRows(allowed).valid, true);
  assert.equal(a.dailySeries(allowed).length, 7311);
  const over = [allowed[0], row({ id: "2", date: "2020-01-07" })];
  assert.throws(() => a.dailySeries(over), /7,?310|20 years/);
  assert.equal(a.validateRows(over).valid, false);
  assert.throws(
    () =>
      a.dailySeries([
        row({ date: "0001-01-01" }),
        row({ id: "2", date: "9999-12-31" }),
      ]),
    /7,?310|20 years/,
  );
});
