import test from "node:test";
import assert from "node:assert/strict";
import {
  capacityExceptions,
  serviceExceptions,
  recentServiceBurn,
  exceptionFilters,
} from "../src/decisions.js";

const row = (extra = {}) => ({
  environment: "production",
  provider: "aws",
  region: "us-east-1",
  tier: "growth",
  timestamp: "2026-11-01T00:00:00Z",
  hours: 24,
  transactions: 100,
  errors: 0,
  slaTarget: 0.99,
  cpuCapacityHours: 100,
  cpuUsedHours: 50,
  memoryCapacityGbHours: 100,
  memoryUsedGbHours: 50,
  storageCapacityGbHours: 100,
  storageUsedGbHours: 50,
  ...extra,
});

test("capacity exceptions retain memory and storage peaks hidden by provider averages", () => {
  const rows = [
    row({ memoryUsedGbHours: 95, hours: 1 }),
    row({
      timestamp: "2026-11-02T00:00:00Z",
      storageUsedGbHours: 90,
      transactions: 200,
    }),
    row({ tier: "free", cpuUsedHours: 85 }),
    row({ tier: "enterprise", cpuUsedHours: 20, transactions: 10000 }),
  ];
  const result = capacityExceptions(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0].resource, "memory");
  assert.equal(result[0].peak, 95);
  assert.equal(result[0].severity, "critical");
  assert.equal(result[0].timestamp, "2026-11-01T00:00:00Z");
  assert.equal(result[0].intervals, 2);
  assert.equal(result[0].hours, 25);
  assert.equal(result[0].peakHours, 1);
  assert.equal(result[0].affectedTransactions, 300);
  assert.deepEqual(result[0].scope, {
    environment: "production",
    provider: "aws",
    region: "us-east-1",
    tier: "growth",
  });
  assert.equal(result[0].tab, "capacity");
  assert.equal(result[1].peak, 85);
  assert.equal(result[1].severity, "warning");
  assert.equal(capacityExceptions(rows, 1).length, 1);
  assert.equal(capacityExceptions(rows, 0).length, 0);
  assert.deepEqual(
    capacityExceptions([row({ cpuCapacityHours: 0, cpuUsedHours: 0 })]),
    [],
  );
});

test("service exceptions use cohort error budgets and observed breach intervals", () => {
  const rows = [
    row({ errors: 3, hours: 1 }),
    row({
      timestamp: "2026-11-02T00:00:00Z",
      transactions: 300,
      errors: 3,
      slaTarget: 0.98,
    }),
    row({ tier: "free", transactions: 10000, errors: 0 }),
    row({ tier: "enterprise", errors: 2, slaTarget: 1 }),
  ];
  // Growth has 6 errors with a budget of 7: its individual bad interval
  // must not turn a cohort that meets its weighted SLO into an exception.
  let result = serviceExceptions(rows);
  assert.equal(result.length, 1);
  assert.equal(result[0].scope.tier, "enterprise");
  assert.equal(result[0].burnRate, null);
  assert.equal(result[0].errorBudgetRemainingPercent, null);
  const breached = rows.map((r, i) => (i === 0 ? { ...r, errors: 7 } : r));
  result = serviceExceptions(breached);
  const growth = result.find((e) => e.scope.tier === "growth");
  assert.ok(growth);
  assert.equal(growth.successRate, 97.5);
  assert.equal(growth.slaTarget, 98.25);
  assert.equal(growth.transactions, 400);
  assert.equal(growth.errors, 10);
  assert.ok(Math.abs(growth.allowedErrors - 7) < 1e-10);
  assert.ok(Math.abs(growth.excessErrors - 3) < 1e-10);
  assert.ok(Math.abs(growth.burnRate - 1.4285714285714286) < 1e-10);
  assert.ok(
    Math.abs(growth.errorBudgetRemainingPercent + 42.85714285714286) < 1e-10,
  );
  assert.equal(growth.breachIntervals, 1);
  assert.equal(growth.hours, 1);
  assert.equal(growth.intervals, 2);
  assert.equal(growth.timestamp, "2026-11-01T00:00:00Z");
  assert.equal(growth.tab, "economics");
  assert.equal(serviceExceptions(breached, 1).length, 1);
  assert.deepEqual(
    serviceExceptions([row({ transactions: 0, errors: 0 })]),
    [],
  );
});

test("recent daily burn stays distinct from a compliant full-period SLO", () => {
  const rows = Array.from({ length: 30 }, (_, day) =>
    row({
      timestamp: new Date(Date.UTC(2026, 9, 1 + day)).toISOString().replace(".000", ""),
      transactions: 10000,
      errors: day === 29 ? 1000 : 0,
    }),
  );
  const before = structuredClone(rows);
  rows.forEach(Object.freeze);
  Object.freeze(rows);
  const result = recentServiceBurn(rows, "2026-10-31T00:00:00Z");
  assert.equal(result.checkedCohorts, 1);
  assert.equal(result.unavailableCohorts, 0);
  assert.equal(result.signals.length, 1);
  const signal = result.signals[0];
  assert.equal(signal.kind, "recent-burn");
  assert.equal(signal.tab, "economics");
  assert.equal(signal.start, "2026-10-30T00:00:00Z");
  assert.equal(signal.end, "2026-10-31T00:00:00Z");
  assert.equal(signal.timestamp, signal.start);
  assert.equal(signal.windowHours, 24);
  assert.equal(signal.peakHours, 24);
  assert.equal(signal.severity, "critical");
  assert.ok(Math.abs(signal.burnRate - 10) < 1e-10);
  assert.ok(Math.abs(signal.allowedErrors - 100) < 1e-10);
  assert.ok(Math.abs(signal.excessErrors - 900) < 1e-10);
  assert.equal(signal.successRate, 90);
  assert.equal(signal.slaTarget, 99);
  assert.equal(signal.periodSlaMet, true);
  assert.ok(Math.abs(signal.periodSuccessRate - 99.66666666666667) < 1e-10);
  assert.equal(signal.periodSlaTarget, 99);
  assert.ok(Math.abs(signal.periodBudgetConsumedByRecentPercent - 100 / 3) < 1e-10);
  assert.deepEqual(signal.scope, {
    environment: "production", provider: "aws", region: "us-east-1", tier: "growth",
  });
  assert.deepEqual(serviceExceptions(rows), []);
  assert.deepEqual(rows, before);
});

test("recent burn follows actual hourly or daily resolution and threshold boundaries", () => {
  const end = "2026-11-02T00:00:00Z";
  const rows = [
    row({ hours: 1, timestamp: "2026-11-01T23:00:00Z", errors: 2 }),
    row({ tier: "free", errors: 10 }),
    row({ tier: "enterprise", errors: 1 }),
  ];
  const result = recentServiceBurn(rows, end);
  assert.equal(result.checkedCohorts, 3);
  assert.equal(result.unavailableCohorts, 0);
  assert.equal(result.signals.length, 2);
  assert.equal(result.signals[0].scope.tier, "free");
  assert.equal(result.signals[0].severity, "critical");
  assert.equal(result.signals[0].windowHours, 24);
  assert.equal(result.signals[1].scope.tier, "growth");
  assert.equal(result.signals[1].severity, "warning");
  assert.equal(result.signals[1].windowHours, 1);
  assert.equal(result.signals[1].start, "2026-11-01T23:00:00Z");
  assert.equal(recentServiceBurn(rows, end, 1).signals.length, 1);
  assert.equal(recentServiceBurn(rows, end, 0).signals.length, 0);
  assert.deepEqual(recentServiceBurn([], end), {
    signals: [], unavailableCohorts: 0, checkedCohorts: 0,
  });
});

test("recent burn leaves stale, gapped, overlapping and partial windows unavailable", () => {
  const end = "2026-11-02T00:00:00Z";
  const cases = [
    [row({ timestamp: "2026-10-31T00:00:00Z", errors: 100 })],
    [row({ hours: 1, timestamp: "2026-11-01T22:00:00Z", errors: 100 })],
    [row({ hours: 0.5, timestamp: "2026-11-01T23:30:00Z", errors: 100 })],
    [row({ hours: 1, timestamp: "2026-11-01T23:00:00Z", errors: 100,
      prorated: true, sourceHours: 24, sourceTimestamp: "2026-11-01T00:00:00Z" })],
    [row({ errors: 100 }), row({ hours: 1, timestamp: "2026-11-01T23:00:00Z" })],
    [row({ errors: 100 }), row({ timestamp: "2026-11-01T12:00:00Z", hours: 1 })],
  ];
  for (const rows of cases) {
    assert.deepEqual(recentServiceBurn(rows, end), {
      signals: [], unavailableCohorts: 1, checkedCohorts: 1,
    });
  }
  assert.equal(recentServiceBurn([row()], "invalid").unavailableCohorts, 1);
});

test("recent burn handles zero allowance and zero requests without invented rates", () => {
  const end = "2026-11-02T00:00:00Z";
  const result = recentServiceBurn([
    row({ slaTarget: 1, errors: 1 }),
    row({ tier: "free", slaTarget: 1 }),
    row({ tier: "enterprise", transactions: 0, errors: 0 }),
  ], end);
  assert.equal(result.checkedCohorts, 3);
  assert.equal(result.unavailableCohorts, 0);
  assert.equal(result.signals.length, 1);
  assert.equal(result.signals[0].burnRate, null);
  assert.equal(result.signals[0].zeroBudgetBreached, true);
  assert.equal(result.signals[0].severity, "critical");
  assert.equal(result.signals[0].periodBudgetConsumedByRecentPercent, null);
});

test("exception actions preserve range and replace exact validated scope without mutation", () => {
  const filters = {
    range: "qtd",
    providers: ["gcp"],
    tiers: ["free"],
    environments: [],
    regions: [],
  };
  const exception = capacityExceptions([row({ cpuUsedHours: 95 })])[0];
  assert.deepEqual(exceptionFilters(filters, exception), {
    range: "qtd",
    environments: ["production"],
    providers: ["aws"],
    regions: ["us-east-1"],
    tiers: ["growth"],
  });
  assert.deepEqual(filters.providers, ["gcp"]);
  assert.equal(exceptionFilters({ range: "bad" }, exception).range, "30d");
  assert.throws(() =>
    exceptionFilters(filters, {
      scope: { ...exception.scope, tier: "invalid" },
    }),
  );
  assert.throws(() =>
    exceptionFilters(filters, { scope: { ...exception.scope, region: "dc2" } }),
  );
});
