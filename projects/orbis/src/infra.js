/** Infrastructure facts use allocated capacity-hours, USD, UTC and half-open intervals. */
import { detectAnomalies, forecast } from "./analytics.js?v=4.0";
const HOUR = 3600000,
  DAY = 24 * HOUR;
const COMMITMENT_INVOICE_TOLERANCE_USD = 1e-6;
export const INFRA_FIELDS =
  "id,timestamp,hours,environment,provider,region,tier,transactions,errors,revenue,computeCost,storageCost,networkCost,supportCost,cpuCapacityHours,cpuUsedHours,memoryCapacityGbHours,memoryUsedGbHours,storageCapacityGbHours,storageUsedGbHours,latencyMsSum,committedCost,coveredCost,slaTarget".split(
    ",",
  );
export const PROVIDERS = [
  ["aws", "AWS", ["us-east-1", "us-west-2"]],
  ["gcp", "GCP", ["us-central1", "europe-west1"]],
  ["azure", "Azure", ["eastus", "westeurope"]],
  ["equinix", "Equinix co-lo", ["dc2", "sv5"]],
].map(([id, label, regions]) => ({
  id,
  label,
  regions: regions.map((id) => ({ id, label: id })),
}));
export const ENVIRONMENTS = ["production", "staging", "development"].map(
  (id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }),
);
export const TIERS = ["enterprise", "growth", "free"].map((id) => ({
  id,
  label: id === "free" ? "Free tier" : id[0].toUpperCase() + id.slice(1),
}));
const strings = [
  "id",
  "timestamp",
  "environment",
  "provider",
  "region",
  "tier",
];
const numeric = INFRA_FIELDS.filter((f) => !strings.includes(f));
const additive = numeric.filter((f) => !["hours", "slaTarget"].includes(f));
const iso = (t) => new Date(t).toISOString().replace(".000", "");
const timestampOK = (t) =>
  typeof t === "string" &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(t) &&
  Number.isFinite(Date.parse(t)) &&
  iso(Date.parse(t)) === t;
const ranges = ["30d", "24h", "7d", "qtd", "yoy"];
const dimensions = {
  environments: ["environment", ENVIRONMENTS.map((x) => x.id)],
  providers: ["provider", PROVIDERS.map((x) => x.id)],
  regions: ["region", PROVIDERS.flatMap((x) => x.regions.map((r) => r.id))],
  tiers: ["tier", TIERS.map((x) => x.id)],
};
export function defaultFilters() {
  return {
    range: "30d",
    environments: [],
    providers: [],
    regions: [],
    tiers: [],
  };
}
export function validateFilters(input = {}) {
  const out = defaultFilters();
  if (!input || typeof input !== "object") return out;
  if (ranges.includes(input.range)) out.range = input.range;
  for (const [key, [, allowed]] of Object.entries(dimensions))
    out[key] = Array.isArray(input[key])
      ? [...new Set(input[key].filter((v) => allowed.includes(v)))]
      : [];
  return out;
}
export function validateInfraRows(rows) {
  const errors = [];
  if (!Array.isArray(rows))
    return {
      valid: false,
      errors: [{ row: 0, field: "rows", message: "Expected an array." }],
      rows: [],
    };
  const add = (row, field, message) => errors.push({ row, field, message });
  if (rows.length > 100000) add(0, "rows", "Maximum 100,000 rows allowed.");
  const ids = new Set(),
    cohorts = new Map();
  let first = Infinity,
    last = -Infinity;
  rows.forEach((r, i) => {
    const row = i + 2,
      e = (f, m) => add(row, f, m);
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      e("row", "Expected a fact object.");
      return;
    }
    for (const f of strings)
      if (typeof r[f] !== "string" || !r[f].trim())
        e(f, "Required nonempty text.");
    if (ids.has(r.id)) e("id", "Duplicate ID.");
    ids.add(r.id);
    for (const f of numeric)
      if (typeof r[f] !== "number" || !Number.isFinite(r[f]) || r[f] < 0)
        e(f, "Required finite nonnegative number.");
    for (const [key, [field, allowed]] of Object.entries(dimensions))
      if (!allowed.includes(r[field])) e(field, "Unknown " + field + ".");
    if (
      !PROVIDERS.find((p) => p.id === r.provider)?.regions.some(
        (x) => x.id === r.region,
      )
    )
      e("region", "Region does not belong to provider.");
    for (const f of ["transactions", "errors"])
      if (!Number.isInteger(r[f])) e(f, "Must be an integer.");
    if (r.errors > r.transactions) e("errors", "Errors exceed transactions.");
    if (![1, 24].includes(r.hours)) e("hours", "Hours must be 1 or 24.");
    if (r.slaTarget > 1) e("slaTarget", "SLA target must be between 0 and 1.");
    for (const [used, capacity] of [
      ["cpuUsedHours", "cpuCapacityHours"],
      ["memoryUsedGbHours", "memoryCapacityGbHours"],
      ["storageUsedGbHours", "storageCapacityGbHours"],
      ["coveredCost", "computeCost"],
      ["coveredCost", "committedCost"],
    ])
      if (r[used] > r[capacity]) e(used, `${used} exceeds ${capacity}.`);
    if (r.committedCost > r.computeCost + COMMITMENT_INVOICE_TOLERANCE_USD)
      e("committedCost", "Commitment budget exceeds the compute invoice cost.");
    if (!timestampOK(r.timestamp))
      e("timestamp", "Use a real UTC timestamp YYYY-MM-DDTHH:mm:ssZ.");
    else if ([1, 24].includes(r.hours)) {
      if (
        !r.timestamp.endsWith(":00:00Z") ||
        (r.hours === 24 && !r.timestamp.endsWith("T00:00:00Z"))
      )
        e(
          "timestamp",
          "Intervals must start on an hour; daily intervals start at midnight UTC.",
        );
      const start = Date.parse(r.timestamp),
        end = start + r.hours * HOUR;
      first = Math.min(first, start);
      last = Math.max(last, end);
      const key = [r.environment, r.provider, r.region, r.tier].join("|");
      if (!cohorts.has(key)) cohorts.set(key, []);
      cohorts.get(key).push({ start, end, row });
    }
  });
  for (const intervals of cohorts.values()) {
    intervals.sort((a, b) => a.start - b.start);
    let end = -Infinity;
    for (const interval of intervals) {
      if (interval.start < end)
        add(
          interval.row,
          "interval",
          "Overlapping intervals for an allocated cohort.",
        );
      end = Math.max(end, interval.end);
    }
  }
  if (last - first > 737 * DAY)
    add(0, "timestamp", "Source exceeds maximum two years plus seven days.");
  return { valid: !errors.length, errors, rows };
}
export function parseInfraCSV(text) {
  if (typeof text !== "string") throw Error("CSV input must be text.");
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024)
    throw Error("CSV exceeds 20 MB limit.");
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
    if (records.length > 100001) throw Error("CSV exceeds 100,000 data rows.");
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
      throw Error(
        `CSV row ${records.length + 1}: unexpected character outside quoted field.`,
      );
    cell += c;
  }
  if (quoted) throw Error("CSV has an unclosed quoted field.");
  if (cell !== "" || record.length || closed) finishRow();
  if (!records.length) throw Error("CSV is empty.");
  const header = records.shift().map((x) => x.trim());
  if (
    header.length !== INFRA_FIELDS.length ||
    new Set(header).size !== header.length ||
    INFRA_FIELDS.some((f) => !header.includes(f))
  )
    throw Error(
      "CSV requires exactly these columns: " + INFRA_FIELDS.join(","),
    );
  const indices = INFRA_FIELDS.map((f) => header.indexOf(f));
  const rows = records.map((cells, i) => {
    if (cells.length !== header.length)
      throw Error(`CSV row ${i + 2}: incorrect column count.`);
    return Object.fromEntries(
      INFRA_FIELDS.map((f, j) => {
        let v = cells[indices[j]].trim();
        return [f, numeric.includes(f) ? (v === "" ? NaN : Number(v)) : v];
      }),
    );
  });
  const v = validateInfraRows(rows);
  if (!v.valid) {
    const e = v.errors[0];
    throw Error(
      `CSV row ${e.row}, ${e.field}: ${e.message} (${v.errors.length} issues).`,
    );
  }
  return rows;
}
export function infraCSV(rows) {
  const escape = (v) => {
    let s = String(v ?? "");
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    INFRA_FIELDS.join(","),
    ...rows.map((r) => INFRA_FIELDS.map((f) => escape(r[f])).join(",")),
  ].join("\r\n");
}
export function filterWindow(rows, range = "30d") {
  if (!ranges.includes(range)) range = "30d";
  if (!rows.length)
    return {
      start: null,
      end: null,
      previousStart: null,
      previousEnd: null,
      anchor: null,
      hours: 0,
      label: range,
    };
  let end = -Infinity;
  for (const r of rows)
    end = Math.max(end, Date.parse(r.timestamp) + r.hours * HOUR);
  let start =
    end - ({ "24h": 1, "7d": 7, "30d": 30, yoy: 365 }[range] || 0) * DAY;
  if (range === "qtd") {
    // The exclusive end can fall in the next quarter; use the last included instant.
    const d = new Date(end - 1);
    start = Date.UTC(
      d.getUTCFullYear(),
      Math.floor(d.getUTCMonth() / 3) * 3,
      1,
    );
  }
  return {
    start: iso(start),
    end: iso(end),
    previousStart: iso(start - (end - start)),
    previousEnd: iso(start),
    anchor: iso(end),
    hours: (end - start) / HOUR,
    label:
      range === "yoy"
        ? "Trailing 365 days vs prior 365 days"
        : range === "qtd"
          ? "Quarter to date vs equal prior duration"
          : `Last ${range} vs prior equal duration`,
  };
}
function sliceRows(rows, start, end) {
  const a = Date.parse(start),
    b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  const result = [];
  for (const r of rows) {
    const t = Date.parse(r.timestamp),
      left = Math.max(t, a),
      right = Math.min(t + r.hours * HOUR, b);
    if (right <= left) continue;
    if (left === t && right === t + r.hours * HOUR) {
      result.push(r);
      continue;
    }
    const fraction = (right - left) / (r.hours * HOUR),
      copy = {
        ...r,
        timestamp: iso(left),
        hours: (right - left) / HOUR,
        prorated: true,
        sourceHours: r.sourceHours ?? r.hours,
        sourceTimestamp: r.sourceTimestamp ?? r.timestamp,
      };
    for (const f of additive) copy[f] = r[f] * fraction;
    result.push(copy);
  }
  return result;
}
export function selectInfra(rows, filters = {}) {
  const f = validateFilters(filters),
    window = filterWindow(rows, f.range),
    selected = rows.filter((r) =>
      Object.entries(dimensions).every(
        ([key, [field]]) => !f[key].length || f[key].includes(r[field]),
      ),
    );
  return {
    rows: sliceRows(selected, window.start, window.end),
    previousRows: sliceRows(selected, window.previousStart, window.previousEnd),
    window,
  };
}
export function summarizeInfra(rows) {
  const sums = Object.fromEntries(additive.map((f) => [f, 0]));
  let sla = 0;
  for (const r of rows) {
    for (const f of additive) sums[f] += r[f];
    sla += r.slaTarget * r.transactions;
  }
  const ratio = (a, b) => (b ? (100 * a) / b : null);
  const s = { ...sums };
  s.totalCost = s.computeCost + s.storageCost + s.networkCost + s.supportCost;
  s.contribution = s.revenue - s.totalCost;
  s.margin = ratio(s.contribution, s.revenue);
  s.costPerTransaction = s.transactions ? s.totalCost / s.transactions : null;
  s.revenuePerTransaction = s.transactions ? s.revenue / s.transactions : null;
  s.successRate = ratio(s.transactions - s.errors, s.transactions);
  s.avgLatencyMs = s.transactions ? s.latencyMsSum / s.transactions : null;
  s.cpuUtilization = ratio(s.cpuUsedHours, s.cpuCapacityHours);
  s.memoryUtilization = ratio(s.memoryUsedGbHours, s.memoryCapacityGbHours);
  s.storageUtilization = ratio(s.storageUsedGbHours, s.storageCapacityGbHours);
  s.headroom = s.cpuUtilization === null ? null : 100 - s.cpuUtilization;
  s.commitmentUtilization = ratio(s.coveredCost, s.committedCost);
  s.commitmentCoverage = ratio(s.coveredCost, s.computeCost);
  s.slaTarget = ratio(sla, s.transactions);
  s.slaMet =
    s.successRate === null ? null : s.successRate + 1e-10 >= s.slaTarget;
  s.peakCpuUtilization = null;
  s.saturatedIntervals = 0;
  for (const r of rows) {
    if (r.cpuCapacityHours > 0) {
      const u = (100 * r.cpuUsedHours) / r.cpuCapacityHours;
      s.peakCpuUtilization =
        s.peakCpuUtilization === null ? u : Math.max(s.peakCpuUtilization, u);
      if (u >= 85) s.saturatedIntervals++;
    }
  }
  return s;
}
export function groupInfra(rows, dimension) {
  if (!["provider", "region", "environment", "tier"].includes(dimension))
    throw Error("Unknown infrastructure dimension.");
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r[dimension])) groups.set(r[dimension], []);
    groups.get(r[dimension]).push(r);
  }
  return [...groups]
    .map(([key, values]) => ({ key, ...summarizeInfra(values) }))
    .sort((a, b) => b.totalCost - a.totalCost || a.key.localeCompare(b.key));
}
export function seriesInfra(rows, range = "30d") {
  if (!rows.length) return [];
  const step = range === "24h" ? HOUR : DAY,
    groups = new Map();
  let first = Infinity,
    last = -Infinity;
  for (const r of rows) {
    const t = Date.parse(r.timestamp),
      end = t + r.hours * HOUR;
    for (
      let bucket = Math.floor(t / step) * step;
      bucket < end;
      bucket += step
    ) {
      const left = Math.max(bucket, t),
        right = Math.min(bucket + step, end);
      if (right <= left) continue;
      const fraction = (right - left) / (r.hours * HOUR),
        copy = { ...r, hours: (right - left) / HOUR };
      for (const f of additive) copy[f] = r[f] * fraction;
      if (!groups.has(bucket)) groups.set(bucket, []);
      groups.get(bucket).push(copy);
      first = Math.min(first, bucket);
      last = Math.max(last, bucket);
    }
  }
  if (last - first > 737 * DAY)
    throw Error("Series exceeds two years plus seven days.");
  const result = [];
  for (let t = first; t <= last; t += step) {
    const s = summarizeInfra(groups.get(t) || []);
    const observed = groups.has(t);
    result.push({
      date: iso(t),
      observed,
      ...Object.fromEntries(
        [
          "transactions",
          "revenue",
          "totalCost",
          "contribution",
          "cpuUtilization",
          "memoryUtilization",
          "storageUtilization",
          "successRate",
          "costPerTransaction",
        ].map((f) => [f, observed ? s[f] : null]),
      ),
    });
  }
  return result;
}
export function capacityModel(
  summary,
  { demandGrowth = 20, capacityChange = 0, efficiencyGain = 0 } = {},
) {
  if (
    !Number.isFinite(demandGrowth) ||
    demandGrowth < -90 ||
    demandGrowth > 300 ||
    !Number.isFinite(capacityChange) ||
    capacityChange < -90 ||
    capacityChange > 300 ||
    !Number.isFinite(efficiencyGain) ||
    efficiencyGain < 0 ||
    efficiencyGain > 80
  )
    throw Error(
      "Scenario bounds: demand/capacity -90..300%; efficiency 0..80%.",
    );
  const factor =
    ((1 + demandGrowth / 100) * (1 - efficiencyGain / 100)) /
    (1 + capacityChange / 100);
  const resources = [
    ["cpu", 75, 85],
    ["memory", 85, 90],
    ["storage", 85, 90],
  ].map(([resource, target, warning]) => {
    const baseline = summary[`${resource}Utilization`],
      projected =
        Number.isFinite(baseline) && baseline >= 0 ? baseline * factor : null;
    return {
      resource,
      projected,
      targetRatio: projected === null ? null : projected / target,
      status:
        projected === null
          ? "unavailable"
          : projected >= 95
            ? "critical"
            : projected >= warning
              ? "warning"
              : projected > target
                ? "above-target"
                : "within-target",
    };
  });
  const [cpu, memory, storage] = resources.map((r) => r.projected),
    available = resources.filter((r) => r.projected !== null),
    // CPU and memory are required; storage is modeled when supplied.
    missingResources = resources
      .filter((r) => r.resource !== "storage" && r.projected === null)
      .map((r) => r.resource),
    completeness = !available.length
      ? "unavailable"
      : missingResources.length
        ? "partial"
        : "complete",
    binding = available.reduce(
      (best, r) => (!best || r.targetRatio > best.targetRatio ? r : best),
      null,
    ),
    severity = ["within-target", "above-target", "warning", "critical"],
    worstStatus = available.reduce(
      (worst, r) => Math.max(worst, severity.indexOf(r.status)),
      0,
    );
  return {
    projectedCpuUtilization: cpu,
    projectedMemoryUtilization: memory,
    projectedStorageUtilization: storage,
    // Preserve the original CPU-only fields for existing consumers.
    projectedHeadroom: cpu === null ? null : 100 - cpu,
    projectedMemoryHeadroom: memory === null ? null : 100 - memory,
    capacityNeededPercent:
      cpu === null ? null : Math.max(0, (cpu / 75 - 1) * 100),
    requiredCapacityPercent:
      completeness !== "complete"
        ? null
        : Math.max(0, (binding.targetRatio - 1) * 100),
    bindingResource: binding?.resource ?? null,
    resourceStatus: Object.fromEntries(
      resources.map((r) => [r.resource, r.status]),
    ),
    completeness,
    missingResources,
    status: !available.length
      ? "unavailable"
      : worstStatus === 0 && completeness === "partial"
        ? "partial"
        : severity[worstStatus],
  };
}
const metrics = [
  "transactions",
  "revenue",
  "totalCost",
  "contribution",
  "cpuUtilization",
  "memoryUtilization",
  "storageUtilization",
  "successRate",
  "costPerTransaction",
];
export function infraAnomalies(series, metric = "totalCost") {
  if (!metrics.includes(metric)) throw Error("Unknown metric.");
  if (
    series.some((p) => !timestampOK(p.date) || !p.date.endsWith("T00:00:00Z"))
  )
    return [];
  return detectAnomalies(series, metric);
}
export function forecastInfra(series, horizon = 14, metric = "transactions") {
  if (!metrics.includes(metric)) throw Error("Unknown metric.");
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 90)
    throw Error("Forecast horizon must be an integer from 1 to 90.");
  if (series.some((p) => p.observed === false || !Number.isFinite(p[metric])))
    return {
      points: [],
      method: "28-day weekday-mean statistical baseline",
      backtestMape: null,
      reason:
        "Incomplete history: missing or nonfinite daily observations cannot be treated as actual zero.",
    };
  const mapped = series.map((p) => ({
    ...p,
    profit: p.contribution,
    date: p.date?.slice(0, 10),
  }));
  const hourly = series.some(
    (p, i) =>
      !timestampOK(p.date) ||
      p.date.slice(11) !== "00:00:00Z" ||
      (i && Date.parse(p.date) - Date.parse(series[i - 1].date) !== DAY),
  );
  if (hourly)
    return {
      points: [],
      method: "28-day weekday-mean statistical baseline",
      backtestMape: null,
      reason:
        "Forecast requires consecutive daily observations; hourly series are disabled.",
    };
  const result = forecast(
    mapped,
    horizon,
    metric === "contribution" ? "profit" : metric,
  );
  return {
    ...result,
    method: "Statistical " + result.method,
    points: result.points.map((p) => ({ ...p, date: p.date + "T00:00:00Z" })),
  };
}
export function infraInsights(rows, previousRows = []) {
  if (!rows.length) return [];
  const s = summarizeInfra(rows),
    p = summarizeInfra(previousRows),
    money = (v) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(v);
  const out = [
    {
      title: "Scoped economics",
      body: `Revenue ${money(s.revenue)}; allocated infrastructure spend ${money(s.totalCost)}; contribution ${money(s.contribution)}.`,
      severity: s.contribution < 0 ? "warn" : "info",
    },
  ];
  if (previousRows.length)
    out.push({
      title: "Spend comparison",
      body: p.totalCost
        ? `Spend changed ${((s.totalCost / p.totalCost - 1) * 100).toFixed(1)}% versus the comparison period.`
        : `Comparison spend is zero; percentage change is undefined. Absolute change ${money(s.totalCost - p.totalCost)}.`,
      severity: s.totalCost > p.totalCost ? "warn" : "info",
    });
  if (s.cpuUtilization !== null)
    out.push({
      title: "Allocated CPU capacity",
      body: `Capacity-hour weighted CPU utilization is ${s.cpuUtilization.toFixed(1)}%; planning target 75%.`,
      severity: s.cpuUtilization >= 85 ? "warn" : "info",
    });
  out.push({
    title: "Illustrative commitments",
    body: "Allocated prepaid compute budgets and SLA targets are synthetic; they do not represent current vendor contracts.",
    severity: "info",
  });
  return out;
}
export function infrastructureQuality(
  rows,
  { mode = "demo", now = new Date().toISOString(), fetchedAt } = {},
) {
  const v = validateInfraRows(rows),
    checks = [],
    add = (id, label, issues, message) =>
      checks.push({
        id,
        label,
        status: issues.length ? "fail" : "pass",
        affected: new Set(issues.map((e) => e.row)).size,
        message: issues.length ? issues[0].message : message,
      });
  add(
    "schema",
    "Infrastructure schema",
    v.errors.filter((e) => !["interval", ...numeric].includes(e.field)),
    "Required fields, identifiers and provider/region mappings are valid.",
  );
  add(
    "capacity",
    "Numeric and capacity reconciliation",
    v.errors.filter((e) => numeric.includes(e.field)),
    "Nonnegative values, allocated capacity, commitments and requests reconcile.",
  );
  add(
    "allocation",
    "Allocation interval overlap",
    v.errors.filter((e) => e.field === "interval"),
    "No overlapping intervals within allocated cohorts (environment/provider/region/tier).",
  );
  checks.push({
    id: "rows",
    label: "Source facts",
    status: rows.length ? "pass" : "warn",
    affected: rows.length,
    message: `${rows.length.toLocaleString("en-US")} source facts; capacity is allocated per tier.`,
  });
  let end = -Infinity;
  for (const r of rows)
    if (timestampOK(r?.timestamp) && Number.isFinite(r.hours))
      end = Math.max(end, Date.parse(r.timestamp) + r.hours * HOUR);
  const n = Date.parse(now),
    fetch = fetchedAt ? Date.parse(fetchedAt) : null,
    stale =
      !Number.isFinite(end) ||
      !Number.isFinite(n) ||
      n - end > 7 * DAY ||
      end > n + 5 * 60000 ||
      (fetchedAt &&
        (!Number.isFinite(fetch) || n - fetch > DAY || fetch > n + 5 * 60000));
  checks.push({
    id: "freshness",
    label: "Source freshness",
    status: mode === "demo" ? "pass" : stale ? "warn" : "pass",
    affected: mode === "demo" ? 0 : stale ? rows.length : 0,
    message:
      mode === "demo"
        ? "Historical synthetic multi-resolution demo; freshness SLA does not apply."
        : stale
          ? "Missing, stale or future source/fetch timestamps; thresholds are 7 days for data and 24 hours for fetch."
          : `Source intervals end ${iso(end)}; within freshness limits.`,
  });
  return checks;
}
