import test from "node:test";
import assert from "node:assert/strict";
import { upsertSchedule, scheduleSummary } from "../src/runner.js";
const entry = {
  id: "new",
  sourceId: "demo",
  enabled: false,
  everyMinutes: 1440,
  dryRun: true,
};
test("schedule upsert first reads server state and preserves schedules absent from UI cache", async () => {
  const calls = [];
  const existing = { ...entry, id: "existing", nextRunAt: 123 };
  const api = async (path, options) => {
    calls.push({ path, options });
    return options
      ? { schedules: JSON.parse(options.body).schedules }
      : { schedules: [existing] };
  };
  const r = await upsertSchedule(api, entry);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options, undefined);
  assert.equal(calls[1].options.method, "PUT");
  assert.deepEqual(r.schedules, [{ ...entry, id: "existing" }, entry]);
});
test("failed or malformed schedule refresh never sends a destructive PUT", async () => {
  for (const result of [null, {}, { schedules: null }]) {
    let calls = 0;
    await assert.rejects(() =>
      upsertSchedule(async () => {
        calls++;
        return result;
      }, entry),
    );
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(() =>
    upsertSchedule(async () => {
      calls++;
      throw Error("Network failed");
    }, entry),
  );
  assert.equal(calls, 1);
});
test("editing a schedule upserts its ID without duplicating it", async () => {
  const api = async (path, o) =>
    o ? JSON.parse(o.body) : { schedules: [{ ...entry, everyMinutes: 10 }] };
  const r = await upsertSchedule(api, entry);
  assert.deepEqual(r.schedules, [entry]);
});

const now = Date.parse("2026-11-04T12:00:00Z");
test("schedule summary distinguishes disabled, due, future and unknown next runs", () => {
  const schedule = { ...entry, enabled: true, nextRunAt: now / 1000 + 300 };
  assert.equal(scheduleSummary(schedule, [], {}, now).status, "scheduled");
  assert.equal(
    scheduleSummary(schedule, [], {}, now).nextRunAt,
    "2026-11-04T12:05:00.000Z",
  );
  assert.equal(
    scheduleSummary({ ...schedule, nextRunAt: now / 1000 - 61 }, [], {}, now)
      .status,
    "overdue",
  );
  assert.equal(
    scheduleSummary({ ...schedule, nextRunAt: now / 1000 - 60 }, [], {}, now)
      .status,
    "scheduled",
  );
  assert.equal(
    scheduleSummary({ ...schedule, enabled: false }, [], {}, now).status,
    "disabled",
  );
  for (const nextRunAt of [undefined, null, NaN, Infinity, "123", 1e30]) {
    const result = scheduleSummary({ ...schedule, nextRunAt }, [], {}, now);
    assert.equal(result.status, "unknown");
    assert.equal(result.nextRunAt, null);
  }
});
test("schedule history uses latest valid source log without attributing it to a schedule", () => {
  const logs = [
    {
      id: "newer",
      sourceId: "demo",
      at: "2026-11-04T11:00:00Z",
      status: "success",
    },
    {
      id: "other",
      sourceId: "elsewhere",
      at: "2026-11-04T12:00:00Z",
      status: "error",
    },
    {
      id: "old",
      sourceId: "demo",
      at: "2026-11-03T00:00:00Z",
      status: "error",
    },
    { id: "invalid", sourceId: "demo", at: "bad", status: "error" },
  ];
  const summary = scheduleSummary(entry, logs, {}, now);
  assert.deepEqual(summary.lastRun, logs[0]);
  assert.deepEqual(
    logs.map((log) => log.id),
    ["newer", "other", "old", "invalid"],
  );
  assert.equal(
    scheduleSummary({ ...entry, sourceId: "absent" }, logs, {}, now).lastRun,
    null,
  );
});
test("schedule delivery summary reports configured capabilities without exposing destinations", () => {
  assert.equal(
    scheduleSummary(entry, []).destination,
    "Local artifacts (dry run)",
  );
  const delivery = { ...entry, dryRun: false };
  const configured = scheduleSummary(delivery, [], {
    webhookConfigured: true,
    immediateRetries: false,
    webhookUrl: "https://private.example/secret",
  });
  assert.equal(configured.destination, "Local artifacts + configured webhook");
  assert.equal(
    configured.retries,
    "No immediate retries; next scheduled interval",
  );
  assert.doesNotMatch(JSON.stringify(configured), /private\.example|secret/);
  assert.equal(
    scheduleSummary(delivery, [], { webhookConfigured: false }).destination,
    "Local artifacts only",
  );
  assert.equal(
    scheduleSummary(delivery, []).destination,
    "Destination not reported",
  );
  assert.equal(
    scheduleSummary(delivery, []).retries,
    "Retry policy not reported",
  );
});
