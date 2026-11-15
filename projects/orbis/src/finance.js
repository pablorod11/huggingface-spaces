import { summarizeInfra, groupInfra } from "./infra.js?v=4.0";

/**
 * Mechanical decomposition at the blended unit cost, not a causal attribution.
 * The unit-cost effect includes changes in provider, service and workload mix.
 */
export function spendBridge(rows, previousRows) {
  const current = summarizeInfra(rows),
    previous = summarizeInfra(previousRows);
  const totalChange = current.totalCost - previous.totalCost;
  const comparable =
    previous.transactions > 0 &&
    (current.transactions > 0 || current.totalCost === 0);
  const volumeEffect = comparable
    ? (current.transactions - previous.transactions) *
      previous.costPerTransaction
    : 0;
  const unitCostEffect =
    comparable && current.transactions > 0
      ? current.transactions *
        (current.costPerTransaction - previous.costPerTransaction)
      : 0;
  const currentProviders = new Map(
    groupInfra(rows, "provider").map((p) => [p.key, p.totalCost]),
  );
  const previousProviders = new Map(
    groupInfra(previousRows, "provider").map((p) => [p.key, p.totalCost]),
  );
  const providerChanges = [
    ...new Set([...currentProviders.keys(), ...previousProviders.keys()]),
  ]
    .map((key) => {
      const current = currentProviders.get(key) ?? 0,
        previous = previousProviders.get(key) ?? 0;
      return { key, current, previous, change: current - previous };
    })
    .sort(
      (a, b) =>
        Math.abs(b.change) - Math.abs(a.change) || a.key.localeCompare(b.key),
    );
  return {
    current,
    previous,
    comparable,
    volumeEffect,
    unitCostEffect,
    unallocatedChange: comparable ? 0 : totalChange,
    totalChange,
    providerChanges,
  };
}
