import test from "node:test";
import assert from "node:assert/strict";
import * as D from "../src/demo-source.js";
import { INFRA_FIELDS, infraCSV } from "../src/infra.js";
const row = {
  ...Object.fromEntries(INFRA_FIELDS.map((k) => [k, 0])),
  id: "fixture",
  timestamp: "2026-11-02T00:00:00Z",
  hours: 24,
  environment: "production",
  provider: "aws",
  region: "us-east-1",
  tier: "growth",
};
for (const phase of ["fetch", "body"]) {
  test(`required billing ${phase} deadline rejects and aborts instead of hanging`, async () => {
    const never = new Promise(() => {});
    let signal, guard;
    try {
      const result = await Promise.race([
        D.loadDemoSource(async (url, options) => {
          signal = options?.signal;
          return phase === "fetch" ? never : { ok: true, text: () => never };
        }, 2000, 20).then(() => "unexpected-success", (error) => error),
        new Promise((resolve) => {
          guard = setTimeout(() => resolve("deadline-not-enforced"), 250);
        }),
      ]);
      assert.ok(result instanceof Error, String(result));
      assert.match(result.message, /timed out.*retry/i);
      assert.equal(signal.aborted, true);
    } finally {
      clearTimeout(guard);
    }
  });
}
test("valid billing demo survives unavailable optional contract metadata", async () => {
  assert.equal(typeof D.loadDemoSource, "function");
  const result = await D.loadDemoSource(async (url) =>
    url.includes("contracts")
      ? { ok: false, status: 404 }
      : { ok: true, text: async () => infraCSV([row]) },
  );
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.contracts, []);
  assert.match(result.warning, /contract/i);
});
test("malformed contract examples degrade independently while invalid billing remains fatal", async () => {
  const result = await D.loadDemoSource(async (url) =>
    url.includes("contracts")
      ? { ok: true, json: async () => [{ id: "bad" }] }
      : { ok: true, text: async () => infraCSV([row]) },
  );
  assert.equal(result.rows[0].id, "fixture");
  assert.equal(result.contracts.length, 0);
  await assert.rejects(
    () => D.loadDemoSource(async () => ({ ok: false, status: 503 })),
    /503/,
  );
  await assert.rejects(
    () =>
      D.loadDemoSource(async () => ({
        ok: true,
        text: async () => "invalid CSV",
      })),
    /CSV|field|header/i,
  );
});

for (const phase of ["fetch", "body"]) {
  test(`optional contract ${phase} deadline preserves billing and aborts request`, async () => {
    let signal;
    const never = new Promise(() => {});
    const fetcher = async (url, options) => {
      if (!url.includes("contracts"))
        return { ok: true, text: async () => infraCSV([row]) };
      signal = options?.signal;
      return phase === "fetch" ? never : { ok: true, json: async () => never };
    };
    let guard;
    try {
      const result = await Promise.race([
        D.loadDemoSource(fetcher, 20),
        new Promise((resolve) => {
          guard = setTimeout(() => resolve("deadline-not-enforced"), 250);
        }),
      ]);
      assert.notEqual(result, "deadline-not-enforced");
      assert.equal(result.rows[0].id, "fixture");
      assert.deepEqual(result.contracts, []);
      assert.match(result.warning, /contract/i);
      assert.equal(signal.aborted, true);
    } finally {
      clearTimeout(guard);
    }
  });
}

test("successful contract metadata remains available before its deadline", async () => {
  const contract = {
    id: "fixture-contract",
    provider: "aws",
    owner: "Finance",
    renewalDate: "2027-01-01",
    noticeDays: 30,
    term: "Annual",
    illustrative: true,
  };
  let signal;
  const result = await D.loadDemoSource(async (url, options) => {
    if (!url.includes("contracts"))
      return { ok: true, text: async () => infraCSV([row]) };
    signal = options?.signal;
    return { ok: true, json: async () => [contract] };
  }, 100);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.contracts, [contract]);
  assert.equal(result.warning, "");
  assert.equal(signal.aborted, false);
});
