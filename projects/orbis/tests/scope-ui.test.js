import test from "node:test";
import assert from "node:assert/strict";
import {
  incompatibleRegions,
  clearIncompatibleRegions,
  scopeSummary,
  activeFilterCount,
} from "../src/scope-ui.js";

test("GCP selection identifies an AWS region and clears only that restriction", () => {
  const input = {
    range: "7d",
    environments: ["production"],
    providers: ["gcp"],
    regions: ["us-east-1"],
    tiers: ["enterprise"],
  };
  assert.deepEqual(incompatibleRegions(input), ["us-east-1"]);
  assert.deepEqual(clearIncompatibleRegions(input), {
    range: "7d",
    environments: ["production"],
    providers: ["gcp"],
    regions: [],
    tiers: ["enterprise"],
  });
});

test("multiple selected providers retain the union of their compatible regions", () => {
  const input = {
    providers: ["aws", "gcp"],
    regions: ["us-east-1", "us-central1", "eastus", "sv5"],
  };
  assert.deepEqual(incompatibleRegions(input), ["eastus", "sv5"]);
  assert.deepEqual(clearIncompatibleRegions(input).regions, [
    "us-east-1",
    "us-central1",
  ]);
});

test("all providers allow every known region and normalize invalid entries", () => {
  const input = {
    range: "unknown",
    providers: ["unknown"],
    regions: ["sv5", "unknown", "sv5"],
    environments: "production",
    tiers: ["free", "bogus"],
  };
  assert.deepEqual(incompatibleRegions(input), []);
  assert.deepEqual(clearIncompatibleRegions(input), {
    range: "30d",
    environments: [],
    providers: [],
    regions: ["sv5"],
    tiers: ["free"],
  });
  assert.deepEqual(clearIncompatibleRegions(null), {
    range: "30d",
    environments: [],
    providers: [],
    regions: [],
    tiers: [],
  });
});

test("scope helpers do not mutate the input or share output arrays", () => {
  const input = Object.freeze({
    range: "qtd",
    providers: Object.freeze(["aws"]),
    regions: Object.freeze(["us-west-2", "eastus"]),
    tiers: Object.freeze(["growth"]),
    environments: Object.freeze(["staging"]),
  });
  const result = clearIncompatibleRegions(input);
  result.providers.push("gcp");
  result.environments.length = 0;
  assert.deepEqual(input.providers, ["aws"]);
  assert.deepEqual(input.environments, ["staging"]);
  assert.deepEqual(input.regions, ["us-west-2", "eastus"]);
  assert.deepEqual(incompatibleRegions(input), ["eastus"]);
});

test("summary includes readable selected dimensions and period, including an incompatible region", () => {
  assert.equal(
    scopeSummary({
      range: "7d",
      environments: ["production"],
      providers: ["gcp"],
      regions: ["us-east-1"],
      tiers: ["enterprise"],
    }),
    "Last 7 days · Environment: Production · Provider: GCP · Region: us-east-1 · Customer tier: Enterprise",
  );
  const summary = scopeSummary({
    range: "24h",
    providers: ["aws", "equinix"],
    tiers: ["free", "growth"],
  });
  assert.match(summary, /Last 24 hours/);
  assert.match(summary, /Provider: AWS, Equinix co-lo/);
  assert.match(summary, /Customer tier: Free tier, Growth/);
  assert.match(summary, /Environment: All/);
  assert.match(summary, /Region: All/);
  assert.equal(
    scopeSummary(null),
    "Last 30 days · Environment: All · Provider: All · Region: All · Customer tier: All",
  );
  assert.match(scopeSummary({ range: "qtd" }), /^Quarter to date/);
  assert.match(scopeSummary({ range: "yoy" }), /^Year over year/);
});

test("active count counts dimensions once plus a nondefault period after validation", () => {
  assert.equal(activeFilterCount(null), 0);
  assert.equal(
    activeFilterCount({
      range: "30d",
      providers: ["aws", "gcp"],
      regions: ["us-east-1", "us-central1"],
    }),
    2,
  );
  assert.equal(
    activeFilterCount({
      range: "qtd",
      providers: ["aws"],
      regions: ["us-east-1"],
      environments: ["production"],
      tiers: ["free"],
    }),
    5,
  );
  assert.equal(
    activeFilterCount({ range: "bad", providers: ["bad"], regions: ["bad"] }),
    0,
  );
  assert.equal(activeFilterCount({ range: "yoy" }), 1);
});
