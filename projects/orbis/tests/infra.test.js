import test from "node:test";
import assert from "node:assert/strict";
import * as I from "../src/infra.js";
const fact = (extra = {}) =>
  Object.fromEntries(
    I.INFRA_FIELDS.map((k) => [
      k,
      {
        id: "a",
        timestamp: "2026-11-02T00:00:00Z",
        hours: 24,
        environment: "production",
        provider: "aws",
        region: "us-east-1",
        tier: "growth",
        transactions: 100,
        errors: 1,
        revenue: 20,
        computeCost: 4,
        storageCost: 1,
        networkCost: 1,
        supportCost: 1,
        cpuCapacityHours: 100,
        cpuUsedHours: 50,
        memoryCapacityGbHours: 200,
        memoryUsedGbHours: 100,
        storageCapacityGbHours: 400,
        storageUsedGbHours: 100,
        latencyMsSum: 1000,
        committedCost: 4,
        coveredCost: 3,
        slaTarget: 0.99,
        ...extra,
      }[k],
    ]),
  );
test("weighted capacity, commitments and undefined ratios", () => {
  let s = I.summarizeInfra([
    fact(),
    fact({ id: "b", cpuCapacityHours: 900, cpuUsedHours: 810 }),
  ]);
  assert.equal(s.cpuUtilization, 86);
  assert.equal(s.commitmentCoverage, 75);
  assert.equal(s.commitmentUtilization, 75);
  assert.equal(s.slaTarget, 99);
  assert.equal(I.summarizeInfra([]).successRate, null);
  assert.equal(I.summarizeInfra([]).slaMet, null);
});
test("validation catches overlap, allocations, enums and fractional counts", () => {
  assert.equal(I.validateInfraRows([fact()]).valid, true);
  for (const extra of [
    { cpuUsedHours: 101 },
    { coveredCost: 6 },
    { transactions: 2.1 },
    { region: "dc2" },
    { hours: 2 },
    { slaTarget: 2 },
  ])
    assert.equal(I.validateInfraRows([fact(extra)]).valid, false);
  assert.equal(I.validateInfraRows([fact(), fact({ id: "b" })]).valid, false);
  assert.equal(
    I.validateInfraRows([fact(), fact({ id: "b", tier: "free" })]).valid,
    true,
  );
});
test("commitment budgets reconcile to compute invoices within absolute USD tolerance", () => {
  for (const committedCost of [100, 10 + 2e-6]) {
    const result = I.validateInfraRows([
      fact({ computeCost: 10, committedCost, coveredCost: 0 }),
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.field === "committedCost"));
  }
  for (const [computeCost, committedCost] of [
    [10, 10 + 1e-6],
    [20, 20],
  ]) {
    const row = fact({ computeCost, committedCost, coveredCost: 0 });
    assert.equal(I.validateInfraRows([row]).valid, true);
    const summary = I.summarizeInfra([row]);
    assert.equal(summary.totalCost, computeCost + 3);
    assert.equal(summary.commitmentUtilization, 0);
  }
});
test("filters intersect dimensions and do not mutate", () => {
  const f = {
    range: "24h",
    providers: ["aws"],
    regions: ["dc2"],
    tiers: ["growth"],
    environments: [],
  };
  assert.equal(I.selectInfra([fact()], f).rows.length, 0);
  assert.deepEqual(f.regions, ["dc2"]);
  assert.deepEqual(I.validateFilters({ providers: ["invalid"] }).providers, []);
});
test("window boundaries, QTD and proportional slices", () => {
  const rows = [fact(), fact({ id: "old", timestamp: "2026-11-01T00:00:00Z" })];
  let s = I.selectInfra(rows, { range: "24h" });
  assert.equal(s.rows.length, 1);
  assert.equal(s.previousRows.length, 1);
  assert.equal(s.window.end, "2026-11-03T00:00:00Z");
  assert.equal(I.filterWindow(rows, "qtd").start, "2026-10-01T00:00:00Z");
  const hourly = fact({
    id: "anchor",
    timestamp: "2026-11-03T11:00:00Z",
    hours: 1,
  });
  s = I.selectInfra([fact(), hourly], { range: "24h" });
  assert.equal(s.rows[0].hours, 12);
  assert.equal(s.rows[0].transactions, 50);
  assert.equal(rows[0].transactions, 100);
});
test("clipped analytical intervals retain source provenance without changing full facts", () => {
  const daily = fact();
  const anchor = fact({
    id: "anchor", timestamp: "2026-11-03T11:00:00Z", hours: 1,
  });
  const selected = I.selectInfra([daily, anchor], { range: "24h" });
  assert.equal(selected.rows[0].hours, 12);
  assert.equal(selected.rows[0].prorated, true);
  assert.equal(selected.rows[0].sourceHours, 24);
  assert.equal(selected.rows[0].sourceTimestamp, daily.timestamp);
  assert.equal(selected.rows[1], anchor);
  assert.equal(daily.prorated, undefined);
  const resliced = I.selectInfra([
    { ...daily, prorated: true, sourceHours: 24, sourceTimestamp: "2026-11-01T00:00:00Z" },
    anchor,
  ], { range: "24h" });
  assert.equal(resliced.rows[0].sourceTimestamp, "2026-11-01T00:00:00Z");
  assert.equal(resliced.rows[0].sourceHours, 24);
});
for (const [lastDay, quarterStart, nextQuarter] of [
  ["2026-03-31", "2026-01-01", "2026-04-01"],
  ["2026-06-30", "2026-04-01", "2026-07-01"],
  ["2026-09-30", "2026-07-01", "2026-10-01"],
  ["2026-12-31", "2026-10-01", "2027-01-01"],
]) {
  for (const hours of [24, 1]) {
    test(`QTD retains the final ${hours}h interval on ${lastDay}`, () => {
      const row = fact({
        timestamp: `${lastDay}T${hours === 24 ? "00" : "23"}:00:00Z`,
        hours,
      });
      assert.equal(I.validateInfraRows([row]).valid, true);
      const selected = I.selectInfra([row], { range: "qtd" });
      assert.equal(selected.window.start, `${quarterStart}T00:00:00Z`);
      assert.equal(selected.window.end, `${nextQuarter}T00:00:00Z`);
      assert.deepEqual(selected.rows, [row]);
      const duration =
        Date.parse(selected.window.end) - Date.parse(selected.window.start);
      assert.ok(duration > 0);
      assert.equal(selected.window.hours, duration / 3600000);
      assert.equal(selected.window.previousEnd, selected.window.start);
      assert.equal(
        Date.parse(selected.window.previousEnd) -
          Date.parse(selected.window.previousStart),
        duration,
      );
    });
  }
}
test("QTD keeps a non-boundary January snapshot in its current quarter", () => {
  const row = fact({ timestamp: "2026-01-01T00:00:00Z" });
  assert.equal(I.validateInfraRows([row]).valid, true);
  const selected = I.selectInfra([row], { range: "qtd" });
  assert.equal(selected.window.start, "2026-01-01T00:00:00Z");
  assert.equal(selected.window.end, "2026-01-02T00:00:00Z");
  assert.equal(selected.window.hours, 24);
  assert.equal(selected.window.previousStart, "2025-12-31T00:00:00Z");
  assert.equal(selected.window.previousEnd, selected.window.start);
  assert.deepEqual(selected.rows, [row]);
});
test("scenario and gaps", () => {
  const m = I.capacityModel(I.summarizeInfra([fact()]), {
    demandGrowth: 50,
    capacityChange: 0,
  });
  assert.equal(m.projectedCpuUtilization, 75);
  assert.equal(m.capacityNeededPercent, 0);
  assert.equal(I.capacityModel(I.summarizeInfra([])).status, "unavailable");
  assert.throws(() => I.capacityModel({}, { efficiencyGain: 81 }));
  const points = I.seriesInfra([
    fact({ timestamp: "2026-10-30T00:00:00Z" }),
    fact({ id: "b" }),
  ]);
  assert.equal(points.length, 4);
  assert.equal(points[1].cpuUtilization, null);
});
test("capacity status catches memory overload while retaining CPU compatibility", () => {
  const m = I.capacityModel(
    { cpuUtilization: 50, memoryUtilization: 90 },
    { demandGrowth: 20, capacityChange: 0, efficiencyGain: 0 },
  );
  assert.equal(m.projectedMemoryUtilization, 108);
  assert.equal(m.status, "critical");
  assert.equal(m.projectedCpuUtilization, 60);
  assert.equal(m.projectedHeadroom, 40);
  assert.equal(m.capacityNeededPercent, 0);
  assert.equal(m.projectedMemoryHeadroom, -8);
  assert.equal(m.bindingResource, "memory");
  assert.ok(Math.abs(m.requiredCapacityPercent - 27.05882352941176) < 1e-10);
  assert.deepEqual(m.resourceStatus, {
    cpu: "within-target",
    memory: "critical",
    storage: "unavailable",
  });
});
test("capacity scenarios use the binding storage or CPU resource and target boundaries", () => {
  const storage = I.capacityModel(
    { cpuUtilization: 50, memoryUtilization: 50, storageUtilization: 90 },
    { demandGrowth: 20 },
  );
  assert.equal(storage.projectedStorageUtilization, 108);
  assert.equal(storage.bindingResource, "storage");
  assert.equal(storage.resourceStatus.storage, "critical");
  assert.equal(storage.status, "critical");
  assert.ok(
    Math.abs(storage.requiredCapacityPercent - 27.05882352941176) < 1e-10,
  );
  const cpu = I.capacityModel(
    { cpuUtilization: 90, memoryUtilization: 50, storageUtilization: 50 },
    { demandGrowth: 0 },
  );
  assert.equal(cpu.bindingResource, "cpu");
  assert.equal(cpu.status, "warning");
  assert.ok(Math.abs(cpu.requiredCapacityPercent - 20) < 1e-10);
  for (const [memory, expected] of [
    [85, "within-target"],
    [86, "above-target"],
    [90, "warning"],
    [95, "critical"],
  ]) {
    const m = I.capacityModel(
      { cpuUtilization: 75, memoryUtilization: memory },
      { demandGrowth: 0 },
    );
    assert.equal(m.status, expected);
  }
});
test("capacity scenarios distinguish missing required baselines from observed zero", () => {
  for (const summary of [
    { cpuUtilization: 50 },
    { memoryUtilization: 50 },
    { cpuUtilization: NaN, memoryUtilization: 50 },
  ]) {
    const m = I.capacityModel(summary, { demandGrowth: 0 });
    assert.equal(m.status, "partial");
    assert.equal(m.completeness, "partial");
    assert.equal(m.requiredCapacityPercent, null);
    assert.ok(m.missingResources.length > 0);
  }
  const empty = I.capacityModel({});
  assert.equal(empty.status, "unavailable");
  assert.equal(empty.completeness, "unavailable");
  assert.equal(empty.bindingResource, null);
  const zero = I.capacityModel({ cpuUtilization: 0, memoryUtilization: 0 });
  assert.equal(zero.status, "within-target");
  assert.equal(zero.completeness, "complete");
  assert.equal(zero.requiredCapacityPercent, 0);
  assert.equal(zero.projectedMemoryHeadroom, 100);
  const overloadedPartial = I.capacityModel(
    { memoryUtilization: 100 },
    { demandGrowth: 0 },
  );
  assert.equal(overloadedPartial.status, "critical");
  assert.equal(overloadedPartial.completeness, "partial");
});
test("CSV roundtrip and spreadsheet escaping", () => {
  assert.deepEqual(I.parseInfraCSV(I.infraCSV([fact()])), [fact()]);
  assert.match(I.infraCSV([fact({ id: "=SUM(A1)" })]), /"'=SUM/);
  assert.throws(() => I.parseInfraCSV("id\na"));
});
test("forecast abstains for hourly and short data; anomalies use prior history", () => {
  assert.equal(
    I.forecastInfra(I.seriesInfra([fact()], "24h")).points.length,
    0,
  );
  const series = Array.from({ length: 42 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().replace(".000", ""),
    transactions: 100,
    totalCost: i === 41 ? 1000 : 10,
  }));
  assert.equal(I.forecastInfra(series).points.length, 14);
  assert.equal(I.infraAnomalies(series).at(-1).date, series.at(-1).date);
  assert.equal(I.infraAnomalies(series.slice(0, 14)).length, 0);
});
import { readFileSync } from "node:fs";
test("generated source is bounded, two-year complete, uniquely allocated and deterministic totals reconcile", () => {
  const text = readFileSync(
    new URL("../data/infrastructure.csv", import.meta.url),
    "utf8",
  );
  assert.ok(Buffer.byteLength(text) < 20 * 1024 * 1024);
  const rows = I.parseInfraCSV(text);
  assert.equal(rows.length, 54216);
  assert.equal(rows[0].timestamp, "2024-11-03T00:00:00Z");
  const selection = I.selectInfra(rows, { range: "yoy" });
  assert.equal(selection.window.previousStart, "2024-11-03T00:00:00Z");
  assert.equal(I.seriesInfra(selection.previousRows).length, 365);
  assert.equal(I.seriesInfra(selection.rows).length, 365);
  assert.equal(
    I.seriesInfra(I.selectInfra(rows, { range: "24h" }).rows, "24h").length,
    24,
  );
  assert.equal(I.selectInfra(rows, { range: "24h" }).rows.length, 1728);
  const meta = JSON.parse(
      readFileSync(
        new URL("../data/infrastructure-metrics.json", import.meta.url),
        "utf8",
      ),
    ),
    s = I.summarizeInfra(I.selectInfra(rows).rows);
  for (const key of Object.keys(meta.last30Days))
    assert.ok(
      Math.abs(s[key] - meta.last30Days[key]) < 0.00002,
      `${key}: ${s[key]} != ${meta.last30Days[key]}`,
    );
  assert.ok(s.peakCpuUtilization >= 95);
  assert.ok(s.saturatedIntervals > 0);
  assert.ok(s.commitmentCoverage <= 100);
  assert.ok(s.commitmentUtilization <= 100);
  assert.equal(
    I.infrastructureQuality(rows).filter((c) => c.status === "fail").length,
    0,
  );
});
test("defensive CSV quoting, size caps, invalid timestamps and overlap sorting", () => {
  assert.throws(() => I.parseInfraCSV('"unclosed'));
  assert.throws(
    () => I.parseInfraCSV("x".repeat(20 * 1024 * 1024 + 1)),
    /20 MB/,
  );
  assert.equal(
    I.validateInfraRows([fact({ timestamp: "2026-02-30T00:00:00Z" })]).valid,
    false,
  );
  assert.equal(
    I.validateInfraRows([
      fact({ id: "later", timestamp: "2026-11-03T00:00:00Z" }),
      fact(),
    ]).valid,
    true,
  );
  assert.equal(
    I.validateInfraRows([
      fact({ id: "short", timestamp: "2026-11-02T04:00:00Z", hours: 1 }),
      fact(),
    ]).valid,
    false,
  );
});
test("forecast contribution intervals retain negative economics and reject invalid horizons", () => {
  const daily = Array.from({ length: 42 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 8, 1 + i)).toISOString().replace(".000", ""),
    contribution: -10,
    transactions: 20,
  }));
  const f = I.forecastInfra(daily, 14, "contribution");
  assert.equal(f.points[0].value, -10);
  assert.ok(f.points[0].lower <= f.points[0].value);
  assert.throws(() => I.forecastInfra([], 0));
  assert.equal(
    I.infraAnomalies([{ date: "2026-11-02T01:00:00Z", totalCost: 1 }]).length,
    0,
  );
});
test("absent daily observations remain unavailable while observed zero activity stays zero", () => {
  const rows = [
    fact({
      timestamp: "2026-10-01T00:00:00Z",
      transactions: 0,
      errors: 0,
      revenue: 0,
      latencyMsSum: 0,
    }),
    fact({ id: "later", timestamp: "2026-11-02T00:00:00Z" }),
  ];
  const points = I.seriesInfra(rows);
  assert.equal(points[0].observed, true);
  assert.equal(points[0].transactions, 0);
  assert.equal(points[1].observed, false);
  assert.equal(points[1].transactions, null);
  assert.equal(points[1].totalCost, null);
  const f = I.forecastInfra(points);
  assert.equal(f.points.length, 0);
  assert.match(f.reason, /Incomplete history/);
  assert.equal(I.infraAnomalies(points).length, 0);
});
test("negative capacity baselines remain unavailable rather than report excess headroom", () => {
  const invalid = I.capacityModel({
    cpuUtilization: -50,
    memoryUtilization: -30,
  });
  assert.equal(invalid.status, "unavailable");
  assert.equal(invalid.projectedCpuUtilization, null);
  assert.equal(invalid.projectedMemoryHeadroom, null);
  const partial = I.capacityModel({
    cpuUtilization: 50,
    memoryUtilization: -30,
  });
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.missingResources, ["memory"]);
});
