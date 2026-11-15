import test from "node:test";
import assert from "node:assert/strict";
import {
  captureInvestigation,
  intervalEvidence,
} from "../src/investigation.js";

const scope = {
  environment: "production",
  provider: "aws",
  region: "us-east-1",
  tier: "enterprise",
};
const exception = {
  scope,
  timestamp: "2026-11-02T06:00:00Z",
  peakHours: 1,
  resource: "cpu",
  kind: "capacity",
};
const state = () => ({
  filters: {
    range: "7d",
    providers: ["gcp"],
    regions: [],
    environments: [],
    tiers: [],
  },
  tab: "executive",
  token: "never retain",
});

test("previous analysis is validated, isolated from later mutation and excludes unrelated state", () => {
  const input = state();
  input.filters.providers.push("unknown");
  const result = captureInvestigation(
    input,
    { ...exception, secret: "omit" },
    "demo",
  );
  input.filters.providers.length = 0;
  scope.tier = "growth";
  assert.deepEqual(result.previous, {
    filters: {
      range: "7d",
      providers: ["gcp"],
      regions: [],
      environments: [],
      tiers: [],
    },
    tab: "executive",
  });
  assert.equal(result.exception.scope.tier, "enterprise");
  assert.equal(result.sourceKey, "demo");
  assert.equal(result.exception.secret, undefined);
  assert.equal(result.previous.token, undefined);
  scope.tier = "enterprise";
});

test("repeated inspection preserves original analysis only for the same source", () => {
  const first = captureInvestigation(state(), exception, "demo");
  const current = {
    filters: { range: "24h", providers: ["aws"] },
    tab: "capacity",
  };
  const next = captureInvestigation(
    current,
    { ...exception, resource: "memory" },
    "demo",
    first,
  );
  assert.equal(next.previous.tab, "executive");
  assert.equal(next.previous.filters.range, "7d");
  assert.equal(next.exception.resource, "memory");
  next.previous.filters.providers.push("azure");
  assert.deepEqual(first.previous.filters.providers, ["gcp"]);
  const otherSource = captureInvestigation(
    current,
    exception,
    "upload:second",
    first,
  );
  assert.equal(otherSource.previous.tab, "capacity");
  assert.equal(otherSource.previous.filters.range, "24h");
});

test("malformed previous state and unsafe exception fields are not retained", () => {
  const result = captureInvestigation(
    { tab: "bogus", filters: { range: "bogus" } },
    {
      scope: { ...scope, secret: "omit" },
      timestamp: "invalid",
      peakHours: -1,
      windowHours: Infinity,
      resource: {},
      kind: {},
    },
    "demo",
  );
  assert.equal(result.previous.tab, "executive");
  assert.equal(result.previous.filters.range, "30d");
  assert.deepEqual(result.exception.scope, scope);
  assert.equal(result.exception.timestamp, undefined);
  assert.equal(result.exception.peakHours, undefined);
  assert.equal(result.exception.windowHours, undefined);
  assert.equal(result.exception.resource, undefined);
  assert.equal(result.exception.kind, undefined);
});

test("interval evidence requires exact cohort, timestamp and duration without synthesizing hourly data", () => {
  const daily = {
    ...scope,
    timestamp: exception.timestamp,
    hours: 24,
    transactions: 240,
  };
  const otherTier = {
    ...scope,
    tier: "free",
    timestamp: exception.timestamp,
    hours: 1,
  };
  const otherHour = { ...scope, timestamp: "2026-11-02T07:00:00Z", hours: 1 };
  const exact = {
    ...scope,
    timestamp: exception.timestamp,
    hours: 1,
    transactions: 10,
  };
  assert.equal(
    intervalEvidence([daily, otherTier, otherHour], exception),
    null,
  );
  assert.equal(intervalEvidence([daily, otherTier, exact], exception), exact);
  assert.equal(
    intervalEvidence([daily], { ...exception, peakHours: 24 }),
    daily,
  );
  assert.equal(
    intervalEvidence([exact], {
      scope,
      timestamp: exception.timestamp,
      windowHours: 1,
    }),
    exact,
  );
});

test("prorated evidence stays raw and distinguishable from observed hourly evidence", () => {
  const prorated = {
    ...scope,
    timestamp: exception.timestamp,
    hours: 1,
    prorated: true,
    transactions: 10.5,
  };
  assert.equal(intervalEvidence([prorated], exception), prorated);
  assert.equal(intervalEvidence([prorated], exception).prorated, true);
  assert.equal(
    intervalEvidence([prorated], { ...exception, peakHours: 0.5 }),
    null,
  );
  assert.equal(
    intervalEvidence([prorated], { ...exception, scope: { provider: "aws" } }),
    null,
  );
  assert.equal(
    intervalEvidence([prorated], { ...exception, timestamp: "invalid" }),
    null,
  );
});
