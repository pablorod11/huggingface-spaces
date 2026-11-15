/** Full-collection schedule writes must merge a fresh server read, never a UI cache. */
export async function upsertSchedule(api, entry) {
  const result = await api("/api/schedules");
  if (!result || !Array.isArray(result.schedules))
    throw Error(
      "Companion schedule response is invalid. No schedules were saved.",
    );
  const next = result.schedules
    .filter((s) => s.id !== entry.id)
    .map(({ id, sourceId, enabled, everyMinutes, dryRun }) => ({
      id,
      sourceId,
      enabled,
      everyMinutes,
      dryRun,
    }));
  next.push(entry);
  return api("/api/schedules", {
    method: "PUT",
    body: JSON.stringify({ schedules: next }),
  });
}

/** Last run is source-level history; logs do not identify the triggering schedule. */
export function scheduleSummary(
  schedule,
  logs,
  operations = {},
  now = Date.now(),
) {
  const due = Number.isFinite(schedule.nextRunAt)
    ? schedule.nextRunAt * 1000
    : NaN;
  const validDue =
    Number.isFinite(due) && Number.isFinite(new Date(due).getTime());
  const lastRun = (Array.isArray(logs) ? logs : []).reduce((latest, log) => {
    if (
      log?.sourceId !== schedule.sourceId ||
      !Number.isFinite(Date.parse(log.at))
    )
      return latest;
    return !latest || Date.parse(log.at) > Date.parse(latest.at) ? log : latest;
  }, null);
  return {
    status: !schedule.enabled
      ? "disabled"
      : !validDue || !Number.isFinite(now)
        ? "unknown"
        : due + 60000 < now
          ? "overdue"
          : "scheduled",
    nextRunAt: validDue ? new Date(due).toISOString() : null,
    lastRun,
    destination: schedule.dryRun
      ? "Local artifacts (dry run)"
      : operations?.webhookConfigured === true
        ? "Local artifacts + configured webhook"
        : operations?.webhookConfigured === false
          ? "Local artifacts only"
          : "Destination not reported",
    retries:
      operations?.immediateRetries === false
        ? "No immediate retries; next scheduled interval"
        : "Retry policy not reported",
  };
}
