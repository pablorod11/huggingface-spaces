import { summarizeInfra, validateFilters, PROVIDERS } from "./infra.js?v=4.0";

const dimensions = ["environment", "provider", "region", "tier"];
function cohorts(rows) {
  const groups = new Map();
  for (const row of rows) {
    const scope = Object.fromEntries(
      dimensions.map((field) => [field, row[field]]),
    );
    const key = JSON.stringify(dimensions.map((field) => row[field]));
    if (!groups.has(key)) groups.set(key, { key, scope, rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()];
}
const bounded = (items, limit) =>
  items.slice(0, Math.max(0, Math.floor(limit)));

/** Observed saturated intervals, never inferred continuous saturation. */
export function capacityExceptions(rows, limit = 5) {
  const exceptions = [];
  for (const group of cohorts(rows)) {
    let peak = null,
      intervals = 0,
      hours = 0,
      affectedTransactions = 0;
    for (const row of group.rows) {
      let highest = null;
      for (const [resource, used, capacity] of [
        ["cpu", "cpuUsedHours", "cpuCapacityHours"],
        ["memory", "memoryUsedGbHours", "memoryCapacityGbHours"],
        ["storage", "storageUsedGbHours", "storageCapacityGbHours"],
      ]) {
        if (!(row[capacity] > 0) || !Number.isFinite(row[used])) continue;
        const utilization = (100 * row[used]) / row[capacity];
        if (!highest || utilization > highest.peak)
          highest = {
            resource,
            peak: utilization,
            timestamp: row.timestamp,
            peakHours: row.hours,
          };
      }
      if (!highest || highest.peak < 85) continue;
      intervals++;
      hours += row.hours;
      affectedTransactions += row.transactions;
      if (!peak || highest.peak > peak.peak) peak = highest;
    }
    if (peak)
      exceptions.push({
        key: group.key,
        scope: group.scope,
        tab: "capacity",
        ...peak,
        severity: peak.peak >= 95 ? "critical" : "warning",
        intervals,
        hours,
        affectedTransactions,
      });
  }
  return bounded(
    exceptions.sort((a, b) => b.peak - a.peak || a.key.localeCompare(b.key)),
    limit,
  );
}

/** Weighted SLO breaches at the allocated cohort grain. */
export function serviceExceptions(rows, limit = 100) {
  const exceptions = [];
  for (const group of cohorts(rows)) {
    const summary = summarizeInfra(group.rows);
    if (summary.slaMet !== false) continue;
    const allowedErrors = group.rows.reduce(
      (sum, row) => sum + row.transactions * (1 - row.slaTarget),
      0,
    );
    let breachIntervals = 0,
      hours = 0,
      worst = null;
    for (const row of group.rows) {
      if (!row.transactions) continue;
      const shortfall =
        100 * (row.errors / row.transactions - (1 - row.slaTarget));
      if (shortfall <= 1e-10) continue;
      breachIntervals++;
      hours += row.hours;
      if (!worst || shortfall > worst.shortfall)
        worst = { shortfall, timestamp: row.timestamp, peakHours: row.hours };
    }
    const burnRate = allowedErrors > 0 ? summary.errors / allowedErrors : null;
    exceptions.push({
      key: group.key,
      scope: group.scope,
      tab: "economics",
      successRate: summary.successRate,
      slaTarget: summary.slaTarget,
      errors: summary.errors,
      transactions: summary.transactions,
      allowedErrors,
      excessErrors: Math.max(0, summary.errors - allowedErrors),
      errorBudgetRemainingPercent:
        allowedErrors > 0 ? 100 * (1 - burnRate) : null,
      burnRate,
      breachIntervals,
      intervals: group.rows.length,
      hours,
      timestamp: worst?.timestamp ?? null,
      peakHours: worst?.peakHours ?? null,
      severity: burnRate === null || burnRate >= 2 ? "critical" : "warning",
    });
  }
  return bounded(
    exceptions.sort(
      (a, b) =>
        b.slaTarget - b.successRate - (a.slaTarget - a.successRate) ||
        b.excessErrors - a.excessErrors ||
        a.key.localeCompare(b.key),
    ),
    limit,
  );
}

/** Recent observed burn is independent of compliance over the selected period. */
export function recentServiceBurn(rows, end, limit = 72) {
  const groups = cohorts(rows),
    anchor = Date.parse(end),
    hour = 3600000,
    iso = (stamp) => new Date(stamp).toISOString().replace(".000", ""),
    allowance = (facts) =>
      facts.reduce(
        (sum, row) => sum + row.transactions * (1 - row.slaTarget),
        0,
      );
  const signals = [];
  let unavailableCohorts = 0;
  for (const group of groups) {
    const intervals = group.rows.map((row) => ({
      row,
      start: Date.parse(row.timestamp),
      end: Date.parse(row.timestamp) + row.hours * hour,
    }));
    const tail = intervals.find(
      (interval) =>
        Number.isFinite(anchor) &&
        interval.end === anchor &&
        [1, 24].includes(interval.row.hours) &&
        !interval.row.prorated &&
        interval.start % (interval.row.hours * hour) === 0,
    );
    if (!tail) {
      unavailableCohorts++;
      continue;
    }
    const recent = intervals
      .filter(
        (interval) => interval.end > tail.start && interval.start < anchor,
      )
      .sort((a, b) => a.start - b.start);
    let cursor = tail.start,
      complete = true;
    for (const interval of recent) {
      const row = interval.row;
      if (
        interval.start !== cursor ||
        interval.end > anchor ||
        row.prorated ||
        ![1, 24].includes(row.hours) ||
        interval.start % (row.hours * hour) !== 0 ||
        !Number.isFinite(row.transactions) ||
        row.transactions < 0 ||
        !Number.isFinite(row.errors) ||
        row.errors < 0 ||
        row.errors > row.transactions ||
        !Number.isFinite(row.slaTarget) ||
        row.slaTarget < 0 ||
        row.slaTarget > 1
      )
        complete = false;
      cursor = interval.end;
    }
    if (!complete || cursor !== anchor) {
      unavailableCohorts++;
      continue;
    }
    const facts = recent.map((interval) => interval.row),
      summary = summarizeInfra(facts),
      allowedErrors = allowance(facts),
      burnRate = allowedErrors > 0 ? summary.errors / allowedErrors : null,
      zeroBudgetBreached = allowedErrors === 0 && summary.errors > 0;
    if (
      !summary.transactions ||
      (!zeroBudgetBreached && (burnRate === null || burnRate + 1e-10 < 2))
    )
      continue;
    const period = summarizeInfra(group.rows),
      periodAllowance = allowance(group.rows);
    signals.push({
      key: group.key,
      scope: group.scope,
      tab: "economics",
      kind: "recent-burn",
      start: iso(tail.start),
      end: iso(anchor),
      windowHours: tail.row.hours,
      timestamp: iso(tail.start),
      peakHours: tail.row.hours,
      errors: summary.errors,
      transactions: summary.transactions,
      allowedErrors,
      burnRate,
      zeroBudgetBreached,
      excessErrors: Math.max(0, summary.errors - allowedErrors),
      successRate: summary.successRate,
      slaTarget: summary.slaTarget,
      periodSlaMet: period.slaMet,
      periodSuccessRate: period.successRate,
      periodSlaTarget: period.slaTarget,
      periodBudgetConsumedByRecentPercent:
        periodAllowance > 0 ? (100 * summary.errors) / periodAllowance : null,
      severity:
        zeroBudgetBreached || burnRate + 1e-10 >= 10 ? "critical" : "warning",
    });
  }
  signals.sort(
    (a, b) =>
      Number(b.severity === "critical") - Number(a.severity === "critical") ||
      Number(b.zeroBudgetBreached) - Number(a.zeroBudgetBreached) ||
      (b.burnRate ?? 0) - (a.burnRate ?? 0) ||
      a.key.localeCompare(b.key),
  );
  return {
    signals: bounded(signals, limit),
    unavailableCohorts,
    checkedCohorts: groups.length,
  };
}

/** Exact cohort actions keep the active time range and replace dimensions. */
export function exceptionFilters(filters, exception) {
  const scope = exception?.scope;
  const proposed = {
    range: filters?.range,
    environments: [scope?.environment],
    providers: [scope?.provider],
    regions: [scope?.region],
    tiers: [scope?.tier],
  };
  const validated = validateFilters(proposed);
  if (
    ["environments", "providers", "regions", "tiers"].some(
      (field) => validated[field].length !== 1,
    ) ||
    !PROVIDERS.find((provider) => provider.id === scope.provider)?.regions.some(
      (region) => region.id === scope.region,
    )
  )
    throw Error("Exception requires a valid exact infrastructure scope.");
  return validated;
}
