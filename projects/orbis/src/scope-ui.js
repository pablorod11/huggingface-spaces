import {
  validateFilters,
  PROVIDERS,
  ENVIRONMENTS,
  TIERS,
} from "./infra.js?v=4.0";

const dimensions = ["environments", "providers", "regions", "tiers"];
const periods = {
  "30d": "Last 30 days",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  qtd: "Quarter to date",
  yoy: "Year over year",
};

/** Empty provider selection means all providers; regions intersect their union. */
export function incompatibleRegions(filters) {
  const scope = validateFilters(filters);
  if (!scope.providers.length) return [];
  const allowed = new Set(
    PROVIDERS.filter((provider) =>
      scope.providers.includes(provider.id),
    ).flatMap((provider) => provider.regions.map((region) => region.id)),
  );
  return scope.regions.filter((region) => !allowed.has(region));
}

export function clearIncompatibleRegions(filters) {
  const scope = validateFilters(filters);
  const excluded = new Set(incompatibleRegions(scope));
  scope.regions = scope.regions.filter((region) => !excluded.has(region));
  return scope;
}

export function scopeSummary(filters) {
  const scope = validateFilters(filters);
  const describe = (key, options) =>
    scope[key].length
      ? scope[key]
          .map((id) => options.find((option) => option.id === id)?.label || id)
          .join(", ")
      : "All";
  return [
    periods[scope.range],
    `Environment: ${describe("environments", ENVIRONMENTS)}`,
    `Provider: ${describe("providers", PROVIDERS)}`,
    `Region: ${scope.regions.length ? scope.regions.join(", ") : "All"}`,
    `Customer tier: ${describe("tiers", TIERS)}`,
  ].join(" · ");
}

/** Count selected dimensions, not options, plus a period other than the 30d default. */
export function activeFilterCount(filters) {
  const scope = validateFilters(filters);
  return (
    dimensions.filter((key) => scope[key].length).length +
    Number(scope.range !== "30d")
  );
}
