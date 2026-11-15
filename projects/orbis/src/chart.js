import { dailySeries } from "./analytics.js?v=4.0";
/** Actuals stop at the source's latest date; future calendar days are never training data. */
export function actualHistory(rows, window, sourceEnd) {
  if (!rows.length || !window.start || !window.end || !sourceEnd) return [];
  const end = window.end < sourceEnd ? window.end : sourceEnd;
  if (window.start > end) return [];
  const map = new Map(dailySeries(rows).map((row) => [row.date, row]));
  const length = Math.min(
    7311,
    Math.round((Date.parse(end) - Date.parse(window.start)) / 86400000) + 1,
  );
  return Array.from({ length }, (_, i) => {
    const date = new Date(Date.parse(window.start) + i * 86400000)
      .toISOString()
      .slice(0, 10);
    return map.get(date) || { date, revenue: 0, profit: 0, orders: 0, cost: 0 };
  });
}
export function metricLabel(metric) {
  return (
    { revenue: "Revenue", profit: "Gross profit", orders: "Orders" }[metric] ||
    "Revenue"
  );
}
