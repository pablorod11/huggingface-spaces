import { validateFilters, forecastInfra } from "./infra.js?v=4.0";
const DAY = 86400000,
  HOUR = 3600000;
const iso = (stamp) => new Date(stamp).toISOString().replace(".000", "");
const dimensions = [
  ["environments", "environment"],
  ["providers", "provider"],
  ["regions", "region"],
  ["tiers", "tier"],
];

/** Daily forecast context independent of the visible range; all ends are exclusive UTC. */
export function forecastContext(rows, filters, window, horizon = 14) {
  const empty = forecastInfra([], horizon, "transactions");
  const anchor = Date.parse(window?.end),
    dayEnd = Math.floor(anchor / DAY) * DAY;
  const result = {
    ...empty,
    series: [],
    trainingStart: null,
    trainingEnd: Number.isFinite(dayEnd) ? iso(dayEnd) : null,
    trainingDays: 0,
    completeDayEnd: Number.isFinite(dayEnd) ? iso(dayEnd) : null,
    evaluation: null,
  };
  if (!Number.isFinite(anchor))
    return { ...result, reason: "A valid UTC source window end is required." };
  if (anchor !== dayEnd)
    return {
      ...result,
      reason:
        "Forecast unavailable until the source anchor ends on a complete UTC day; partial observed days cannot be forecast again.",
    };
  const validated = validateFilters(filters);
  const scoped = rows
    .filter((row) =>
      dimensions.every(
        ([key, field]) =>
          !validated[key].length || validated[key].includes(row[field]),
      ),
    )
    .flatMap((row) => {
      const start = Date.parse(row.timestamp),
        end = start + row.hours * HOUR;
      return Number.isFinite(start) && row.hours > 0 && end <= dayEnd
        ? [
            {
              row,
              start,
              end,
              key: JSON.stringify(dimensions.map(([, field]) => row[field])),
            },
          ]
        : [];
    });
  if (!scoped.length)
    return {
      ...result,
      reason: "No complete daily history is available in this scope.",
    };
  const earliest = scoped.reduce(
    (stamp, interval) => Math.min(stamp, interval.start),
    Infinity,
  );
  const trainingStart = Math.max(
    dayEnd - 120 * DAY,
    Math.ceil(earliest / DAY) * DAY,
  );
  const relevant = scoped.filter(
    (interval) => interval.end > trainingStart && interval.start < dayEnd,
  );
  const cohorts = new Set(relevant.map((interval) => interval.key));
  const buckets = new Map();
  for (const interval of relevant) {
    for (
      let day = Math.max(trainingStart, Math.floor(interval.start / DAY) * DAY);
      day < interval.end;
      day += DAY
    ) {
      if (!buckets.has(day)) buckets.set(day, new Map());
      const group = buckets.get(day);
      if (!group.has(interval.key)) group.set(interval.key, []);
      group.get(interval.key).push({
        start: Math.max(day, interval.start),
        end: Math.min(day + DAY, interval.end),
        transactions:
          (interval.row.transactions *
            (Math.min(day + DAY, interval.end) -
              Math.max(day, interval.start))) /
          (interval.end - interval.start),
      });
    }
  }
  const series = [];
  for (let day = trainingStart; day < dayEnd; day += DAY) {
    let complete = cohorts.size > 0,
      transactions = 0;
    for (const key of cohorts) {
      const intervals = (buckets.get(day)?.get(key) || []).sort(
        (a, b) => a.start - b.start,
      );
      let cursor = day;
      for (const interval of intervals) {
        if (
          interval.start !== cursor ||
          !Number.isFinite(interval.transactions) ||
          interval.transactions < 0
        )
          complete = false;
        cursor = interval.end;
        transactions += interval.transactions;
      }
      if (cursor !== day + DAY) complete = false;
    }
    series.push({
      date: iso(day),
      observed: complete,
      transactions: complete ? transactions : null,
    });
  }
  const context = {
    ...result,
    series,
    trainingStart: iso(trainingStart),
    trainingDays: series.length,
  };
  const incomplete = series.filter((point) => !point.observed);
  if (incomplete.length)
    return {
      ...context,
      reason: `Incomplete daily coverage: ${incomplete.length} day(s), first ${incomplete[0].date}; every scoped cohort requires 24 observed, nonoverlapping hours.`,
    };
  const forecast = forecastInfra(series, horizon, "transactions");
  let evaluation = null;
  if (series.length >= 42) {
    const training = series.slice(0, -14),
      holdout = series.slice(-14);
    const predictions = forecastInfra(training, 14, "transactions").points;
    // Both benchmarks use the same frozen fit/holdout dates as the model.
    const naive = training.at(-1).transactions,
      lastWeek = training.slice(-7);
    const errors = holdout.map((point, i) => ({
      actual: point.transactions,
      error: Math.abs(point.transactions - predictions[i].value),
      naive: Math.abs(point.transactions - naive),
      seasonalNaive: Math.abs(
        point.transactions - lastWeek[i % 7].transactions,
      ),
    }));
    const mean = (values) =>
      values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
    const nonzero = errors.filter((error) => error.actual !== 0),
      mae = mean(errors.map((error) => error.error)),
      seasonalNaiveMae = mean(errors.map((error) => error.seasonalNaive));
    evaluation = {
      start: holdout[0].date,
      end: iso(dayEnd),
      days: holdout.length,
      fitStart: training[0].date,
      fitEnd: holdout[0].date,
      trainingDays: training.length,
      mae,
      mape: mean(nonzero.map((error) => (100 * error.error) / error.actual)),
      naiveMae: mean(errors.map((error) => error.naive)),
      naiveMape: mean(
        nonzero.map((error) => (100 * error.naive) / error.actual),
      ),
      seasonalNaiveMae,
      seasonalNaiveMape: mean(
        nonzero.map((error) => (100 * error.seasonalNaive) / error.actual),
      ),
      seasonalSkill: seasonalNaiveMae > 0 ? 1 - mae / seasonalNaiveMae : null,
    };
  }
  return { ...context, ...forecast, evaluation };
}
