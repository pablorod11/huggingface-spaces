import { validateFilters, PROVIDERS } from "./infra.js?v=4.0";
import { TABS } from "./infra-state.js?v=4.0";

const fields = ["environment", "provider", "region", "tier"];
const positive = (value) => Number.isFinite(value) && value > 0;
const timestamp = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function cleanScope(input) {
  const filters = validateFilters({
    environments: [input?.environment],
    providers: [input?.provider],
    regions: [input?.region],
    tiers: [input?.tier],
  });
  if (
    ["environments", "providers", "regions", "tiers"].some(
      (key) => filters[key].length !== 1,
    ) ||
    !PROVIDERS.find((p) => p.id === input?.provider)?.regions.some(
      (r) => r.id === input?.region,
    )
  )
    return {};
  return Object.fromEntries(fields.map((key) => [key, input[key]]));
}

function previousAnalysis(state) {
  return {
    filters: validateFilters(state?.filters),
    tab: TABS.includes(state?.tab) ? state.tab : "executive",
  };
}

/** Keep the original analysis across nested inspection, only within this source. */
export function captureInvestigation(
  state,
  exception,
  sourceKey,
  existing = null,
) {
  const key = typeof sourceKey === "string" ? sourceKey : "";
  const clean = { scope: cleanScope(exception?.scope) };
  if (timestamp(exception?.timestamp)) clean.timestamp = exception.timestamp;
  for (const field of ["peakHours", "windowHours"])
    if (positive(exception?.[field])) clean[field] = exception[field];
  for (const field of ["kind", "resource"])
    if (typeof exception?.[field] === "string" && exception[field].length <= 80)
      clean[field] = exception[field];
  return {
    sourceKey: key,
    previous: previousAnalysis(
      existing?.sourceKey === key ? existing.previous : state,
    ),
    exception: clean,
  };
}

/** Return source evidence unchanged: callers must label row.prorated as an estimate. */
export function intervalEvidence(rows, exception) {
  const scope = cleanScope(exception?.scope);
  const hours = exception?.peakHours ?? exception?.windowHours;
  if (
    !fields.every((key) => scope[key]) ||
    !timestamp(exception?.timestamp) ||
    !positive(hours)
  )
    return null;
  return (
    (Array.isArray(rows) ? rows : []).find(
      (row) =>
        fields.every((key) => row?.[key] === scope[key]) &&
        timestamp(row.timestamp) &&
        Date.parse(row.timestamp) === Date.parse(exception.timestamp) &&
        row.hours === hours,
    ) ?? null
  );
}
