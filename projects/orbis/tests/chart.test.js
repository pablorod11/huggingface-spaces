import test from "node:test";
import assert from "node:assert/strict";
import { actualHistory, metricLabel } from "../src/chart.js";
const row = (date, revenue) => ({
  date,
  revenue,
  cost: revenue / 2,
  profit: revenue / 2,
  orders: 1,
});
test("future custom date windows cannot append zero actuals to forecast training history", () => {
  const rows = [row("2026-10-30", 100), row("2026-10-31", 110)];
  const history = actualHistory(
    rows,
    { start: "2026-10-29", end: "2026-12-31" },
    "2026-10-31",
  );
  assert.deepEqual(
    history.map((r) => r.date),
    ["2026-10-29", "2026-10-30", "2026-10-31"],
  );
  assert.equal(history.at(-1).revenue, 110);
  assert.equal(history[0].revenue, 0);
});
test("historical custom window ends at selected date and wholly future/empty scope abstains", () => {
  const rows = [row("2026-10-30", 100), row("2026-10-31", 110)];
  assert.equal(
    actualHistory(
      rows,
      { start: "2026-10-30", end: "2026-10-30" },
      "2026-10-31",
    ).length,
    1,
  );
  assert.deepEqual(
    actualHistory(
      rows,
      { start: "2026-11-01", end: "2026-12-31" },
      "2026-10-31",
    ),
    [],
  );
  assert.deepEqual(
    actualHistory([], { start: "2026-10-01", end: "2026-12-31" }, "2026-10-31"),
    [],
  );
});
test("metric labels remain consistent across revenue, profit and order charts", () => {
  assert.equal(metricLabel("revenue"), "Revenue");
  assert.equal(metricLabel("profit"), "Gross profit");
  assert.equal(metricLabel("orders"), "Orders");
});
