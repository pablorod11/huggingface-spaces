/** Pure UTC analytics for normalized retail facts. Money is USD; ratios are percent. */
const DAY = 86400000;
// Bounds zero-fill work for sparse sources before any daily point allocation.
const MAX_DATE_SPAN_DAYS = 7310;
const DATE_SPAN_MESSAGE =
  "Date range exceeds the maximum 7,310-day span (about 20 years). Import a narrower date range.";
const strings = [
  "id",
  "date",
  "region",
  "country",
  "channel",
  "category",
  "product",
];
const numbers = ["revenue", "cost", "orders", "units"];
const fields = [...strings, ...numbers];
const dimensions = ["region", "country", "channel", "category", "product"];
const dateOK = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
const stamp = (value) => Date.parse(value + "T00:00:00Z");
const iso = (value) => new Date(value).toISOString().slice(0, 10);
const plus = (value, days) => iso(stamp(value) + days * DAY);

export function validateRows(rows) {
  const errors = [];
  if (!Array.isArray(rows))
    return {
      valid: false,
      errors: [
        { row: 0, field: "rows", message: "Expected an array of fact rows." },
      ],
      rows: [],
    };
  if (rows.length > 50000)
    errors.push({
      row: 0,
      field: "rows",
      message: "Maximum 50,000 rows allowed.",
    });
  const seen = new Set();
  let earliest = Infinity,
    latest = -Infinity;
  rows.forEach((r, i) => {
    const error = (field, message) =>
      errors.push({ row: i + 2, field, message });
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      error("row", "Expected a fact object.");
      return;
    }
    for (const field of strings)
      if (typeof r[field] !== "string" || !r[field].trim())
        error(field, "Required nonempty text.");
    if (!dateOK(r.date))
      error("date", "Use a real calendar date in YYYY-MM-DD format.");
    else {
      const time = stamp(r.date);
      earliest = Math.min(earliest, time);
      latest = Math.max(latest, time);
    }
    if (seen.has(r.id))
      error("id", "Duplicate ID; each fact must have a unique ID.");
    seen.add(r.id);
    for (const field of numbers)
      if (
        typeof r[field] !== "number" ||
        !Number.isFinite(r[field]) ||
        r[field] < 0
      )
        error(field, "Required finite number greater than or equal to zero.");
    for (const field of ["orders", "units"])
      if (typeof r[field] === "number" && !Number.isInteger(r[field]))
        error(field, "Must be a whole number.");
  });
  if ((latest - earliest) / DAY > MAX_DATE_SPAN_DAYS)
    errors.push({ row: 0, field: "date", message: DATE_SPAN_MESSAGE });
  return { valid: errors.length === 0, errors, rows };
}

export function parseCSV(text) {
  if (typeof text !== "string") throw new Error("CSV input must be text.");
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024)
    throw new Error("CSV exceeds the 5 MB limit.");
  text = text.replace(/^\uFEFF/, "");
  const records = [];
  let record = [],
    cell = "",
    quoted = false,
    closed = false;
  const finishCell = () => {
    record.push(cell);
    cell = "";
    closed = false;
  };
  const finishRow = () => {
    finishCell();
    if (record.some((x) => x !== "")) records.push(record);
    record = [];
    if (records.length > 50001)
      throw new Error("CSV exceeds 50,000 data rows.");
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === ",") {
      finishCell();
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      finishRow();
      continue;
    }
    if (c === '"' && cell === "" && !closed) {
      quoted = true;
      continue;
    }
    if (c === '"' || closed)
      throw new Error(
        `CSV row ${records.length + 1}: unexpected character outside quoted field.`,
      );
    cell += c;
  }
  if (quoted)
    throw new Error(`CSV row ${records.length + 1}: unclosed quoted field.`);
  if (cell !== "" || record.length || closed) finishRow();
  if (!records.length)
    throw new Error("CSV is empty; include the required header.");
  const header = records.shift().map((x) => x.trim());
  if (
    new Set(header).size !== header.length ||
    fields.some((f) => !header.includes(f))
  )
    throw new Error("CSV header requires unique columns: " + fields.join(", "));
  const rows = records.map((cells, i) => {
    if (cells.length !== header.length)
      throw new Error(
        `CSV row ${i + 2}: expected ${header.length} columns, got ${cells.length}.`,
      );
    const r = {};
    fields.forEach((field) => {
      const value = cells[header.indexOf(field)];
      r[field] = numbers.includes(field)
        ? value.trim() === ""
          ? NaN
          : Number(value)
        : value.trim();
    });
    return r;
  });
  const result = validateRows(rows);
  if (!result.valid) {
    const e = result.errors[0];
    throw new Error(
      `CSV row ${e.row}, ${e.field}: ${e.message} (${result.errors.length} validation issue(s)).`,
    );
  }
  return rows;
}

export function csvExport(rows) {
  const escape = (value) => {
    let text = String(value ?? "");
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    fields.join(","),
    ...rows.map((row) => fields.map((field) => escape(row[field])).join(",")),
  ].join("\r\n");
}

export function dateWindow(rows, preset, start, end) {
  if (preset === "custom") {
    if (!dateOK(start) || !dateOK(end) || start > end)
      throw new Error("Custom dates must be valid and start must precede end.");
    return { start, end };
  }
  if (!["30d", "90d", "mtd", "qtd", "ytd", "all"].includes(preset))
    throw new Error("Unknown date preset.");
  if (!rows.length) return { start: null, end: null };
  const dates = rows.map((r) => r.date).sort();
  end = dates.at(-1);
  const [year, month] = end.split("-");
  if (preset === "all") start = dates[0];
  else if (preset === "30d" || preset === "90d")
    start = plus(end, preset === "30d" ? -29 : -89);
  else if (preset === "mtd") start = `${year}-${month}-01`;
  else if (preset === "ytd") start = `${year}-01-01`;
  else
    start = `${year}-${String(Math.floor((Number(month) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return { start, end };
}
export function comparisonWindow({ start, end }, mode = "previous") {
  if (start === null && end === null) return { start: null, end: null };
  if (!dateOK(start) || !dateOK(end) || start > end)
    throw new Error("Invalid comparison date window.");
  if (mode === "previous") {
    const length = Math.round((stamp(end) - stamp(start)) / DAY) + 1;
    return { start: plus(start, -length), end: plus(start, -1) };
  }
  if (mode !== "year") throw new Error("Unknown comparison mode.");
  const previous = (value) => {
    const year = String(Number(value.slice(0, 4)) - 1).padStart(4, "0");
    const candidate = year + value.slice(4);
    return dateOK(candidate) ? candidate : year + "-02-28";
  };
  return { start: previous(start), end: previous(end) };
}
export function filterRows(rows, { start, end, filters = {} } = {}) {
  return rows.filter(
    (row) =>
      (!start || row.date >= start) &&
      (!end || row.date <= end) &&
      dimensions.every(
        (d) => !filters[d]?.length || filters[d].includes(row[d]),
      ),
  );
}
export function summarize(rows) {
  const totals = {
    revenue: 0,
    cost: 0,
    profit: 0,
    margin: null,
    orders: 0,
    units: 0,
    aov: null,
  };
  for (const row of rows) for (const key of numbers) totals[key] += row[key];
  totals.profit = totals.revenue - totals.cost;
  totals.margin = totals.revenue
    ? (totals.profit / totals.revenue) * 100
    : null;
  totals.aov = totals.orders ? totals.revenue / totals.orders : null;
  return totals;
}
export function groupBy(rows, dimension) {
  if (!dimensions.includes(dimension))
    throw new Error("Unknown grouping dimension.");
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[dimension])) groups.set(row[dimension], []);
    groups.get(row[dimension]).push(row);
  }
  return [...groups]
    .map(([key, values]) => ({ key, ...summarize(values) }))
    .sort((a, b) => b.revenue - a.revenue || a.key.localeCompare(b.key));
}
export function dailySeries(rows) {
  if (!rows.length) return [];
  const groups = new Map();
  for (const row of rows) {
    const old = groups.get(row.date) || {
      date: row.date,
      revenue: 0,
      cost: 0,
      profit: 0,
      orders: 0,
    };
    old.revenue += row.revenue;
    old.cost += row.cost;
    old.profit += row.revenue - row.cost;
    old.orders += row.orders;
    groups.set(row.date, old);
  }
  const dates = [...groups.keys()].sort();
  if ((stamp(dates.at(-1)) - stamp(dates[0])) / DAY > MAX_DATE_SPAN_DAYS)
    throw new Error(DATE_SPAN_MESSAGE);
  const output = [];
  for (let time = stamp(dates[0]); time <= stamp(dates.at(-1)); time += DAY) {
    const date = iso(time);
    output.push(
      groups.get(date) || { date, revenue: 0, cost: 0, profit: 0, orders: 0 },
    );
  }
  return output;
}
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
export function detectAnomalies(series, metric = "revenue") {
  const result = [];
  for (let i = 14; i < series.length; i++) {
    const history = series.slice(Math.max(0, i - 28), i).map((p) => p[metric]);
    if (
      history.some((v) => !Number.isFinite(v)) ||
      !Number.isFinite(series[i][metric])
    )
      continue;
    const expected = median(history),
      mad = median(history.map((v) => Math.abs(v - expected)));
    const score =
      (series[i][metric] - expected) /
      Math.max(1, Math.abs(expected) * 0.05, 1.4826 * mad);
    if (Math.abs(score) >= 3.5)
      result.push({
        date: series[i].date,
        value: series[i][metric],
        expected,
        score: Math.abs(score),
        direction: score > 0 ? "up" : "down",
      });
  }
  return result;
}
// Weekly seasonal mean: weekday averages over the most recent 28 training days.
function seasonalPrediction(training, date, metric) {
  const weekday = new Date(stamp(date)).getUTCDay();
  const values = training
    .slice(-28)
    .filter((p) => new Date(stamp(p.date)).getUTCDay() === weekday)
    .map((p) => p[metric]);
  return values.reduce((s, v) => s + v, 0) / values.length;
}
export function forecast(series, horizon = 14, metric = "revenue") {
  const method =
    "28-day weekday-mean baseline; illustrative 95% intervals (not calibrated)";
  const abstain = (reason) => ({
    points: [],
    method,
    backtestMape: null,
    reason,
  });
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 90)
    throw new Error("Forecast horizon must be an integer from 1 to 90.");
  if (series.length < 28)
    return abstain("At least 28 consecutive daily observations are required.");
  if (
    series.some(
      (p, i) =>
        !dateOK(p.date) ||
        !Number.isFinite(p[metric]) ||
        (i && p.date !== plus(series[i - 1].date, 1)),
    )
  )
    return abstain(
      "Forecast requires finite, consecutive, chronological daily observations.",
    );
  let backtestMape = null;
  let errors = [];
  if (series.length >= 42) {
    const training = series.slice(0, -14),
      holdout = series.slice(-14);
    const percentages = [];
    for (const p of holdout) {
      const prediction = seasonalPrediction(training, p.date, metric);
      errors.push(p[metric] - prediction);
      if (p[metric] !== 0)
        percentages.push(Math.abs((p[metric] - prediction) / p[metric]) * 100);
    }
    if (percentages.length)
      backtestMape =
        percentages.reduce((a, b) => a + b, 0) / percentages.length;
  }
  if (!errors.length)
    errors = series
      .slice(-14)
      .map((p) => p[metric] - seasonalPrediction(series, p.date, metric));
  const rmse = Math.sqrt(
    errors.reduce((sum, v) => sum + v * v, 0) / errors.length,
  );
  const points = Array.from({ length: horizon }, (_, i) => {
    const date = plus(series.at(-1).date, i + 1),
      value = seasonalPrediction(series, date, metric);
    const width = 1.96 * rmse * Math.sqrt(1 + (i + 1) / 28);
    return {
      date,
      value,
      lower: metric === "profit" ? value - width : Math.max(0, value - width),
      upper: value + width,
    };
  });
  return {
    points,
    method,
    backtestMape,
    reason:
      backtestMape === null
        ? "MAPE unavailable: need 42 days and nonzero holdout actuals."
        : "Last 14 days held out; forecast fit uses all available days. Zero actuals excluded from MAPE.",
  };
}
export function simulate(
  summary,
  { price = 0, volume = 0, cost = 0, fixed = 0 } = {},
) {
  if (
    [price, volume, cost, fixed].some((v) => !Number.isFinite(v)) ||
    price < -100 ||
    volume < -100 ||
    cost < -100 ||
    fixed < 0
  )
    throw new Error(
      "Scenario requires finite deltas at least -100% and nonnegative fixed expense.",
    );
  const revenue = summary.revenue * (1 + price / 100) * (1 + volume / 100),
    totalCost = summary.cost * (1 + volume / 100) * (1 + cost / 100) + fixed;
  const orders = summary.orders * (1 + volume / 100),
    units = summary.units * (1 + volume / 100),
    profit = revenue - totalCost;
  return {
    revenue,
    cost: totalCost,
    profit,
    margin: revenue ? (profit / revenue) * 100 : null,
    orders,
    units,
    aov: orders ? revenue / orders : null,
  };
}
export function qualityChecks(
  rows,
  { now = new Date().toISOString(), fetchedAt, mode = "live" } = {},
) {
  const validation = validateRows(rows);
  const checks = [];
  const add = (id, label, status, affected, message) =>
    checks.push({ id, label, status, affected, message });
  add(
    "rows",
    "Fact rows",
    rows.length ? "pass" : "warn",
    rows.length,
    rows.length
      ? `${rows.length.toLocaleString("en-US")} source rows.`
      : "Source is empty; load data to analyze.",
  );
  for (const [id, label, predicate] of [
    [
      "required",
      "Required fields",
      (e) =>
        strings.includes(e.field) && e.field !== "date" && e.field !== "id",
    ],
    ["dates", "Calendar dates", (e) => e.field === "date"],
    ["duplicates", "Unique IDs", (e) => e.field === "id"],
    [
      "numbers",
      "Numeric facts",
      (e) =>
        numbers.includes(e.field) || e.field === "rows" || e.field === "row",
    ],
  ]) {
    const issues = validation.errors.filter(predicate);
    add(
      id,
      label,
      issues.length ? "fail" : "pass",
      new Set(issues.map((e) => e.row)).size,
      issues.length ? issues[0].message : "No issues found.",
    );
  }
  const validRows = rows.filter((r) => r && dateOK(r.date));
  const latest = validRows
    .map((r) => r.date)
    .sort()
    .at(-1);
  const nowMs = Date.parse(now),
    fetchedMs = fetchedAt ? Date.parse(fetchedAt) : null;
  const future = validRows.filter((r) => stamp(r.date) > nowMs + DAY).length;
  add(
    "future",
    "Future-dated facts",
    future ? "warn" : "pass",
    future,
    future
      ? "Facts extend beyond the current UTC day."
      : "No future-dated facts.",
  );
  const stale =
    !latest ||
    !Number.isFinite(nowMs) ||
    nowMs - stamp(latest) > 7 * DAY ||
    (fetchedAt &&
      (!Number.isFinite(fetchedMs) ||
        nowMs - fetchedMs > DAY ||
        fetchedMs > nowMs + 5 * 60000));
  add(
    "freshness",
    "Source freshness",
    mode === "demo" ? "pass" : stale ? "warn" : "pass",
    mode === "demo" ? 0 : stale ? rows.length : 0,
    mode === "demo"
      ? "Historical synthetic demo; freshness SLA does not apply."
      : stale
        ? "Source exceeds 7-day data / 24-hour fetch freshness limits, or timestamps are unavailable/invalid."
        : `Data through ${latest}; within freshness limits.`,
  );
  const inconsistent = rows.filter(
    (r) =>
      r &&
      ((r.orders === 0 && r.revenue > 0) || (r.units === 0 && r.orders > 0)),
  ).length;
  add(
    "reconciliation",
    "Activity reconciliation",
    inconsistent ? "warn" : "pass",
    inconsistent,
    inconsistent
      ? "Revenue without orders, or orders without units; review source grain."
      : "Revenue, order and unit activity is consistent.",
  );
  return checks;
}
export function insights(rows, previousRows = []) {
  if (!rows.length) return [];
  const current = summarize(rows),
    previous = summarize(previousRows);
  const money = (value) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  const output = [
    {
      title: "Scope performance",
      body: `Revenue ${money(current.revenue)} from ${current.orders.toLocaleString("en-US")} orders; profit ${money(current.profit)}; margin ${current.margin === null ? "unavailable" : current.margin.toFixed(1) + "%"}.`,
      severity: current.profit < 0 ? "warn" : "info",
    },
  ];
  if (previousRows.length) {
    const change = current.revenue - previous.revenue;
    output.push({
      title: "Revenue comparison",
      body: previous.revenue
        ? `Revenue changed ${((change / previous.revenue) * 100).toFixed(1)}% (${money(change)}) versus the comparison period.`
        : `Comparison revenue is zero; percentage growth is undefined. Absolute revenue change: ${money(change)}.`,
      severity: change < 0 ? "warn" : "info",
    });
  }
  const top = groupBy(rows, "region")[0];
  if (top && current.revenue)
    output.push({
      title: "Largest region",
      body: `${top.key} contributes ${money(top.revenue)}, ${((top.revenue / current.revenue) * 100).toFixed(1)}% of scoped revenue.`,
      severity: "info",
    });
  const anomalies = detectAnomalies(dailySeries(rows));
  if (anomalies.length)
    output.push({
      title: "Statistical anomalies",
      body: `${anomalies.length} daily revenue observation(s) exceed the prior-history robust baseline. Latest: ${anomalies.at(-1).date}. This is a statistical signal, not a cause.`,
      severity: "warn",
    });
  return output;
}
