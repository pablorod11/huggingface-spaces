import test from "node:test";
import assert from "node:assert/strict";
import { spendBridge } from "../src/finance.js";

const row = (provider, transactions, cost) => ({
  provider,
  transactions,
  computeCost: cost,
  storageCost: 0,
  networkCost: 0,
  supportCost: 0,
});
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
const reconciles = (bridge) => {
  close(
    bridge.volumeEffect + bridge.unitCostEffect + bridge.unallocatedChange,
    bridge.totalChange,
  );
  close(
    bridge.providerChanges.reduce((sum, provider) => sum + provider.change, 0),
    bridge.totalChange,
  );
};

test("spending bridge separates transaction volume from blended unit cost and reconciles providers", () => {
  const bridge = spendBridge([row("aws", 150, 450)], [row("aws", 100, 200)]);
  assert.equal(bridge.comparable, true);
  assert.equal(bridge.current.totalCost, 450);
  assert.equal(bridge.previous.totalCost, 200);
  assert.equal(bridge.totalChange, 250);
  assert.equal(bridge.volumeEffect, 100);
  assert.equal(bridge.unitCostEffect, 150);
  assert.equal(bridge.unallocatedChange, 0);
  assert.deepEqual(bridge.providerChanges, [
    { key: "aws", current: 450, previous: 200, change: 250 },
  ]);
  reconciles(bridge);
});

test("spending bridge retains entering and exited providers even when net spend is unchanged", () => {
  const bridge = spendBridge([row("gcp", 100, 200)], [row("aws", 100, 200)]);
  assert.equal(bridge.comparable, true);
  assert.equal(bridge.totalChange, 0);
  assert.deepEqual(
    [...bridge.providerChanges].sort((a, b) => a.key.localeCompare(b.key)),
    [
      { key: "aws", current: 0, previous: 200, change: -200 },
      { key: "gcp", current: 200, previous: 0, change: 200 },
    ],
  );
  reconciles(bridge);
});

test("zero transaction baselines leave spending change unallocated without invented ratios", () => {
  for (const [current, previous, totalChange] of [
    [[row("aws", 100, 200)], [row("aws", 0, 50)], 150],
    [[row("aws", 0, 50)], [row("aws", 100, 200)], -150],
    [[], [], 0],
  ]) {
    const bridge = spendBridge(current, previous);
    assert.equal(bridge.comparable, false);
    assert.equal(bridge.volumeEffect, 0);
    assert.equal(bridge.unitCostEffect, 0);
    assert.equal(bridge.unallocatedChange, totalChange);
    reconciles(bridge);
  }
});

test("complete transaction and spend loss can be decomposed without a current unit cost", () => {
  const bridge = spendBridge([], [row("aws", 100, 200)]);
  assert.equal(bridge.comparable, true);
  assert.equal(bridge.current.costPerTransaction, null);
  assert.equal(bridge.volumeEffect, -200);
  assert.equal(bridge.unitCostEffect, 0);
  assert.equal(bridge.unallocatedChange, 0);
  reconciles(bridge);
});
