import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCSV,
  summarize,
  dateWindow,
  filterRows,
  dailySeries,
  detectAnomalies,
} from "../src/analytics.js";
const rows = parseCSV(
  readFileSync(new URL("../data/demo.csv", import.meta.url), "utf8"),
);

test("public fixture reconciles against independently calculated Decimal totals", () => {
  assert.equal(rows.length, 13140);
  assert.deepEqual(dateWindow(rows, "all"), {
    start: "2024-11-01",
    end: "2026-10-31",
  });
  const total = summarize(rows);
  assert.equal(Math.round(total.revenue * 100), 3492468264);
  assert.equal(Math.round(total.cost * 100), 2174589087);
  assert.equal(total.orders, 284663);
  assert.equal(total.units, 358814);
});
test("demo supports the documented campaign and margin investigation", () => {
  const recent = filterRows(rows, { ...dateWindow(rows, "90d") });
  assert.ok(
    detectAnomalies(dailySeries(recent)).some(
      (x) => x.date === "2026-10-14" && x.direction === "up",
    ),
  );
  const narrow = filterRows(rows, {
    start: "2026-10-19",
    end: "2026-10-31",
    filters: { country: ["United States"], category: ["Home living"] },
  });
  const baseline = filterRows(rows, {
    start: "2026-10-01",
    end: "2026-10-18",
    filters: { country: ["United States"], category: ["Home living"] },
  });
  assert.ok(summarize(narrow).margin < 7);
  assert.ok(summarize(baseline).margin > 25);
});
