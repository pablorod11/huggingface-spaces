/** Provider-level registry only; entries do not establish scoped entitlements. */
import { PROVIDERS } from "./infra.js?v=4.0";

const DAY = 86400000;
const fields = [
  "id",
  "provider",
  "owner",
  "renewalDate",
  "noticeDays",
  "term",
  "notes",
  "illustrative",
];
const providers = new Set(PROVIDERS.map((provider) => provider.id));

function dateTime(value, field) {
  const time =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? Date.parse(`${value}T00:00:00Z`)
      : NaN;
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().split("T")[0] !== value
  )
    throw Error(`${field}: use a real calendar date in YYYY-MM-DD format.`);
  return time;
}

export function validateContracts(input) {
  if (!Array.isArray(input))
    throw Error("Contracts: expected an array of contract objects.");
  if (input.length > 50) throw Error("Contracts: maximum 50 records allowed.");
  const ids = new Set();
  return Array.from(input, (record, index) => {
    const label = `Contract ${index + 1}`;
    const fail = (field, message) => {
      throw Error(`${label}, ${field}: ${message}`);
    };
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(record))
    )
      fail("object", "expected a plain contract object.");
    for (const field of Reflect.ownKeys(record))
      if (!fields.includes(field))
        fail(
          String(field),
          "unknown field; use provider-level contract fields only.",
        );
    for (const field of fields.filter((field) => field !== "notes"))
      if (!Object.hasOwn(record, field))
        fail(field, "required field is missing.");
    const text = (field, limit, required = true) => {
      const value = record[field];
      if (
        typeof value !== "string" ||
        (required && !value.trim()) ||
        value.length > limit
      )
        fail(
          field,
          `expected ${required ? "nonempty " : ""}text of at most ${limit} characters.`,
        );
      return value.trim();
    };
    const id = text("id", 80);
    if (ids.has(id)) fail("id", `duplicate ID "${id}"; IDs must be unique.`);
    ids.add(id);
    if (!providers.has(record.provider))
      fail("provider", `expected one of ${[...providers].join(", ")}.`);
    const owner = text("owner", 120),
      term = text("term", 240);
    dateTime(record.renewalDate, `${label}, renewalDate`);
    if (
      !Number.isInteger(record.noticeDays) ||
      record.noticeDays < 0 ||
      record.noticeDays > 365
    )
      fail("noticeDays", "expected an integer from 0 to 365.");
    if (typeof record.illustrative !== "boolean")
      fail("illustrative", "expected true or false.");
    const out = {
      id,
      provider: record.provider,
      owner,
      renewalDate: record.renewalDate,
      noticeDays: record.noticeDays,
      term,
      illustrative: record.illustrative,
    };
    if (Object.hasOwn(record, "notes")) out.notes = text("notes", 1000, false);
    return out;
  });
}

/** Dates are explicit UTC calendar dates; no dependency on the machine clock. */
export function contractStatus(contract, asOfDate) {
  const [record] = validateContracts([contract]);
  const renewal = dateTime(record.renewalDate, "renewalDate");
  const asOf = dateTime(asOfDate, "asOfDate");
  const notice = renewal - record.noticeDays * DAY;
  return {
    status:
      renewal < asOf ? "expired" : notice <= asOf ? "renewal-due" : "upcoming",
    daysUntilRenewal: (renewal - asOf) / DAY,
    noticeDate: new Date(notice).toISOString().split("T")[0],
    daysUntilNotice: (notice - asOf) / DAY,
  };
}

/** Provider notice deadlines, ordered independently of the registry's input order. */
export function renewalQueue(records, asOf, needsReviewOnly = false) {
  dateTime(asOf, "asOfDate");
  return validateContracts(records)
    .map((record) => {
      const status = contractStatus(record, asOf),
        days = status.daysUntilNotice,
        distance = Math.abs(days),
        duration = `${distance} ${distance === 1 ? "day" : "days"}`;
      return {
        record,
        ...status,
        noticeLabel:
          days < 0
            ? `overdue ${duration}`
            : days === 0
              ? "due today"
              : `in ${duration}`,
        needsReview: days <= 30 || status.status === "expired",
      };
    })
    .filter((item) => !needsReviewOnly || item.needsReview)
    .sort(
      (a, b) =>
        a.daysUntilNotice - b.daysUntilNotice ||
        a.record.id.localeCompare(b.record.id),
    );
}

/** Plain JSON download payload. Source/provenance metadata belongs to the caller. */
export function contractsJSON(contracts) {
  return JSON.stringify(validateContracts(contracts), null, 2) + "\n";
}

/** Key uses committed snapshot provenance, never the currently edited connection. */
export function contractRegistryKey(source) {
  return (
    "ledgerline-contracts-v1:" +
    JSON.stringify([
      source.id,
      source.label,
      ["demo", "upload"].includes(source.id) ? "" : source.connection || "",
    ])
  );
}

export const MAX_CONTRACT_BYTES = 512 * 1024;
export function parseContractsJSON(text) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > MAX_CONTRACT_BYTES
  )
    throw Error("Contract JSON exceeds 512 KB. Existing registry retained.");
  let records;
  try {
    records = JSON.parse(text);
  } catch {
    throw Error(
      "Contract JSON could not be parsed. Export a sample to check the required format.",
    );
  }
  return validateContracts(records);
}
