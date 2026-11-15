import test from "node:test";
import assert from "node:assert/strict";
import { forecastContext } from "../src/forecast-ui.js";
import { INFRA_FIELDS } from "../src/infra.js";
const DAY = 86400000,
  start = Date.parse("2026-01-01T00:00:00Z");
const iso = (stamp) => new Date(stamp).toISOString().replace(".000", "");
const fact = (day, extra = {}) => ({
  ...Object.fromEntries(INFRA_FIELDS.map((field) => [field, 0])),
  timestamp: iso(start + day * DAY),
  hours: 24,
  transactions: 100,
  environment: "production",
  provider: "aws",
  region: "us-east-1",
  tier: "growth",
  ...extra,
});
const history = (days) => Array.from({ length: days }, (_, i) => fact(i));
const windowAt = (day) => ({
  start: iso(start + (day - 1) * DAY),
  end: iso(start + day * DAY),
});
const filters = { range: "24h", providers: ["aws"] };

test("forecast uses scoped daily history beyond visible range and excludes future source facts", () => {
  const rows = [
    ...history(50),
    fact(50, { transactions: 999999 }),
    ...history(50).map((r) => ({
      ...r,
      provider: "gcp",
      region: "us-central1",
      transactions: 999999,
    })),
  ];
  const result = forecastContext(rows, filters, windowAt(50));
  assert.equal(result.trainingDays, 50);
  assert.equal(result.series[0].transactions, 100);
  assert.equal(result.series.at(-1).transactions, 100);
  assert.equal(result.trainingStart, "2026-01-01T00:00:00Z");
  assert.equal(result.trainingEnd, "2026-02-20T00:00:00Z");
  assert.equal(result.completeDayEnd, result.trainingEnd);
  assert.equal(result.points[0].date, "2026-02-20T00:00:00Z");
  assert.equal(result.points[0].value, 100);
});

test("complete hourly source days aggregate to daily transactions without double counting", () => {
  const rows = history(30);
  rows.pop();
  rows.push(
    ...Array.from({ length: 24 }, (_, hour) =>
      fact(29, {
        timestamp: iso(start + 29 * DAY + hour * 3600000),
        hours: 1,
        transactions: 5,
      }),
    ),
  );
  const result = forecastContext(rows, filters, windowAt(30));
  assert.equal(result.trainingDays, 30);
  assert.equal(result.series.at(-1).transactions, 120);
  assert.equal(result.points.length, 14);
});

test("missing days, partial daily cohort coverage and missing cohorts abstain instead of filling zeros", () => {
  const base = history(45);
  for (const rows of [
    base.filter((_, i) => i !== 20),
    base.map((r, i) => (i === 20 ? { ...r, hours: 1 } : r)),
    [
      ...base,
      ...base.filter((_, i) => i !== 20).map((r) => ({ ...r, tier: "free" })),
    ],
  ]) {
    const result = forecastContext(rows, filters, windowAt(45));
    assert.equal(result.points.length, 0);
    assert.match(result.reason, /Incomplete daily coverage/);
    assert.equal(result.series[20].transactions, null);
  }
});

test("forecast uses a frozen fourteen day holdout and labels fitting dates separately", () => {
  const rows = history(42).map((r, i) => ({
    ...r,
    transactions: i < 28 ? 100 : 200,
  }));
  const result = forecastContext(rows, filters, windowAt(42));
  assert.equal(result.evaluation.start, "2026-01-29T00:00:00Z");
  assert.equal(result.evaluation.end, "2026-02-12T00:00:00Z");
  assert.equal(result.evaluation.fitStart, "2026-01-01T00:00:00Z");
  assert.equal(result.evaluation.fitEnd, result.evaluation.start);
  assert.equal(result.evaluation.trainingDays, 28);
  assert.equal(result.evaluation.days, 14);
  assert.equal(result.evaluation.mae, 100);
  assert.equal(result.evaluation.mape, 50);
  assert.equal(result.evaluation.naiveMae, 100);
  assert.equal(result.evaluation.naiveMape, 50);
  assert.equal(result.points[0].value, 150);
});

test("weekly seasonal-naive repeats the final training week over the same frozen holdout", () => {
  const weekly = [100, 100, 100, 100, 100, 1000, 1000];
  const rows = history(42).map((row, i) => ({
    ...row,
    transactions: weekly[i % 7],
  }));
  const evaluation = forecastContext(rows, filters, windowAt(42)).evaluation;
  assert.equal(evaluation.seasonalNaiveMae, 0);
  assert.equal(evaluation.seasonalNaiveMape, 0);
  assert.equal(evaluation.seasonalSkill, null);
  assert.ok(evaluation.naiveMae > 0);
  assert.equal(evaluation.fitEnd, "2026-01-29T00:00:00Z");
  assert.equal(evaluation.start, evaluation.fitEnd);
  assert.equal(evaluation.end, "2026-02-12T00:00:00Z");
  const changedLastWeek = history(42).map((row, i) => ({
    ...row,
    transactions: i < 21 ? 100 : 200,
  }));
  const changed = forecastContext(
    changedLastWeek,
    filters,
    windowAt(42),
  ).evaluation;
  assert.equal(changed.seasonalNaiveMae, 0);
  assert.equal(changed.mae, 75);
  assert.equal(changed.seasonalSkill, null);
});

test("a holdout spike never becomes a seasonal-naive prediction for the following week", () => {
  const rows = history(42).map((row, i) => ({
    ...row,
    transactions: i === 28 ? 800 : 100,
  }));
  const evaluation = forecastContext(rows, filters, windowAt(42)).evaluation;
  assert.equal(evaluation.seasonalNaiveMae, 50);
  assert.equal(evaluation.seasonalNaiveMape, 6.25);
  assert.equal(evaluation.seasonalSkill, 0);
  assert.equal(evaluation.naiveMae, 50);
  const modelWins = history(42).map((row, i) => ({
    ...row,
    transactions: i < 21 ? 0 : i < 28 ? 100 : 25,
  }));
  const winning = forecastContext(modelWins, filters, windowAt(42)).evaluation;
  assert.equal(winning.seasonalNaiveMae, 75);
  assert.equal(winning.mae, 0);
  assert.equal(winning.seasonalSkill, 1);
});

test("seasonal-naive MAE includes zero actuals while MAPE excludes them", () => {
  const rows = history(42).map((row, i) => ({
    ...row,
    transactions: i < 28 ? 100 : i % 2 ? 200 : 0,
  }));
  const mixed = forecastContext(rows, filters, windowAt(42)).evaluation;
  assert.equal(mixed.seasonalNaiveMae, 100);
  assert.equal(mixed.seasonalNaiveMape, 50);
  assert.equal(mixed.seasonalSkill, 0);
  const zeros = forecastContext(
    history(42).map((row) => ({
      ...row,
      transactions: 0,
    })),
    filters,
    windowAt(42),
  ).evaluation;
  assert.equal(zeros.seasonalNaiveMae, 0);
  assert.equal(zeros.seasonalNaiveMape, null);
  assert.equal(zeros.seasonalSkill, null);
});

test("training is bounded to120 days and excludes a partial first source day", () => {
  const bounded = forecastContext(history(150), filters, windowAt(150));
  assert.equal(bounded.trainingDays, 120);
  assert.equal(bounded.trainingStart, "2026-01-31T00:00:00Z");
  const rows = history(31);
  rows[0] = fact(0, { timestamp: "2026-01-01T12:00:00Z", hours: 12 });
  const result = forecastContext(rows, filters, windowAt(31));
  assert.equal(result.trainingDays, 30);
  assert.equal(result.trainingStart, "2026-01-02T00:00:00Z");
  assert.equal(result.points.length, 14);
});

test("partial-day anchors abstain so predictions never overlap observed partial days", () => {
  const result = forecastContext(history(45), filters, {
    end: "2026-02-14T12:00:00Z",
  });
  assert.equal(result.points.length, 0);
  assert.equal(result.completeDayEnd, "2026-02-14T00:00:00Z");
  assert.match(result.reason, /complete UTC day/);
});
