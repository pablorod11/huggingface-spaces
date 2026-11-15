import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/contracts.js";
import { readFile } from "node:fs/promises";
import {
  validateContracts,
  contractStatus,
  contractsJSON,
} from "../src/contracts.js";

const contract = (extra = {}) => ({
  id: "DEMO-AWS",
  provider: "aws",
  owner: "Procurement",
  renewalDate: "2026-11-20",
  noticeDays: 30,
  term: "Illustrative annual term.",
  illustrative: true,
  ...extra,
});

test("contracts normalize text without mutating the provider-level source", () => {
  const input = [
    contract({
      id: " DEMO-AWS ",
      owner: " FinOps ",
      term: " Annual ",
      notes: " Example ",
    }),
  ];
  const result = validateContracts(input);
  assert.deepEqual(result, [
    {
      id: "DEMO-AWS",
      provider: "aws",
      owner: "FinOps",
      renewalDate: "2026-11-20",
      noticeDays: 30,
      term: "Annual",
      notes: "Example",
      illustrative: true,
    },
  ]);
  assert.equal(input[0].owner, " FinOps ");
  assert.notEqual(result[0], input[0]);
  assert.deepEqual(validateContracts([]), []);
  assert.equal(
    validateContracts([contract({ illustrative: false })])[0].illustrative,
    false,
  );
});

test("registry rejects malformed shapes and unsupported scope or metadata", () => {
  for (const input of [
    null,
    {},
    "[]",
    [null],
    [[]],
    [new Date()],
    [Object.create(contract())],
  ])
    assert.throws(() => validateContracts(input), /array|object|field/i);
  for (const field of ["region", "environment", "tier", "source", "__proto__"])
    assert.throws(
      () => validateContracts([{ ...contract(), [field]: "anything" }]),
      /unknown|unsupported/i,
    );
  for (const provider of ["AWS", " aws ", "other", null])
    assert.throws(
      () => validateContracts([contract({ provider })]),
      /provider/i,
    );
  for (const illustrative of [undefined, "true", 1])
    assert.throws(
      () => validateContracts([contract({ illustrative })]),
      /illustrative/i,
    );
});

test("registry enforces unique normalized identifiers and collection bounds", () => {
  assert.throws(
    () => validateContracts([contract(), contract({ id: " DEMO-AWS " })]),
    /duplicate.*DEMO-AWS/i,
  );
  const fifty = Array.from({ length: 50 }, (_, i) =>
    contract({ id: `DEMO-${i}` }),
  );
  assert.equal(validateContracts(fifty).length, 50);
  assert.throws(() => validateContracts([...fifty, contract()]), /50/);
});

test("registry enforces bounded required text and optional notes", () => {
  for (const [field, limit] of [
    ["id", 80],
    ["owner", 120],
    ["term", 240],
    ["notes", 1000],
  ]) {
    assert.equal(
      validateContracts([contract({ [field]: "a".repeat(limit) })])[0][field]
        .length,
      limit,
    );
    assert.throws(
      () => validateContracts([contract({ [field]: "a".repeat(limit + 1) })]),
      new RegExp(field),
    );
    assert.throws(
      () => validateContracts([contract({ [field]: {} })]),
      new RegExp(field),
    );
    if (field !== "notes")
      assert.throws(
        () => validateContracts([contract({ [field]: "   " })]),
        new RegExp(field),
      );
  }
  assert.equal(validateContracts([contract({ notes: " " })])[0].notes, "");
});

test("registry requires real calendar dates and integer notice days including endpoints", () => {
  for (const renewalDate of [
    "2026-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-01",
    "2026-1-01",
    "2026-11-20T00:00:00Z",
    null,
  ])
    assert.throws(
      () => validateContracts([contract({ renewalDate })]),
      /renewalDate.*YYYY-MM-DD/i,
    );
  assert.equal(
    validateContracts([contract({ renewalDate: "2024-02-29" })])[0].renewalDate,
    "2024-02-29",
  );
  for (const noticeDays of [-1, 366, 0.5, "30", NaN, Infinity])
    assert.throws(
      () => validateContracts([contract({ noticeDays })]),
      /noticeDays.*0.*365/i,
    );
  for (const noticeDays of [0, 365])
    assert.equal(
      validateContracts([contract({ noticeDays })])[0].noticeDays,
      noticeDays,
    );
});

test("status uses UTC calendar days at notice and renewal boundaries", () => {
  const c = contract();
  for (const [asOf, status, daysUntilRenewal, daysUntilNotice] of [
    ["2026-10-20", "upcoming", 31, 1],
    ["2026-10-21", "renewal-due", 30, 0],
    ["2026-11-03", "renewal-due", 17, -13],
    ["2026-11-20", "renewal-due", 0, -30],
    ["2026-11-21", "expired", -1, -31],
  ])
    assert.deepEqual(contractStatus(c, asOf), {
      status,
      daysUntilRenewal,
      noticeDate: "2026-10-21",
      daysUntilNotice,
    });
  assert.deepEqual(
    contractStatus(
      contract({ renewalDate: "2024-03-01", noticeDays: 1 }),
      "2024-02-29",
    ),
    {
      status: "renewal-due",
      daysUntilRenewal: 1,
      noticeDate: "2024-02-29",
      daysUntilNotice: 0,
    },
  );
  assert.equal(
    contractStatus(contract({ noticeDays: 0 }), "2026-11-19").status,
    "upcoming",
  );
  assert.equal(
    contractStatus(contract({ noticeDays: 0 }), "2026-11-20").status,
    "renewal-due",
  );
  assert.throws(() => contractStatus(c, "2026-02-29"), /asOfDate/i);
  assert.throws(() => contractStatus(c, new Date()), /asOfDate/i);
  assert.throws(
    () => contractStatus(contract({ noticeDays: -1 }), "2026-11-03"),
    /noticeDays/i,
  );
});

test("renewal queue orders notice deadlines and distinguishes expired, today and future", () => {
  const records = [
    contract({ id: "future", renewalDate: "2026-12-04", noticeDays: 0 }),
    contract({ id: "today-b", renewalDate: "2026-11-13", noticeDays: 10 }),
    contract({ id: "expired", renewalDate: "2026-11-01", noticeDays: 0 }),
    contract({ id: "today-a", renewalDate: "2026-11-03", noticeDays: 0 }),
    contract({ id: "cutoff", renewalDate: "2026-12-03", noticeDays: 0 }),
    contract({ id: "tomorrow", renewalDate: "2026-11-04", noticeDays: 0 }),
  ];
  const before = structuredClone(records);
  records.forEach(Object.freeze);
  Object.freeze(records);
  assert.equal(typeof C.renewalQueue, "function");
  const queue = C.renewalQueue(records, "2026-11-03");
  assert.deepEqual(
    queue.map((item) => item.record.id),
    ["expired", "today-a", "today-b", "tomorrow", "cutoff", "future"],
  );
  assert.deepEqual(
    queue.map((item) => item.noticeLabel),
    [
      "overdue 2 days",
      "due today",
      "due today",
      "in 1 day",
      "in 30 days",
      "in 31 days",
    ],
  );
  assert.deepEqual(
    queue.map((item) => item.needsReview),
    [true, true, true, true, true, false],
  );
  for (const item of queue) {
    const { record, noticeLabel, needsReview, ...status } = item;
    assert.deepEqual(status, contractStatus(record, "2026-11-03"));
  }
  assert.equal(queue[0].status, "expired");
  assert.equal(queue[1].status, "renewal-due");
  assert.equal(queue[2].daysUntilRenewal, 10);
  assert.deepEqual(
    C.renewalQueue(records, "2026-11-03", true),
    queue.filter((item) => item.needsReview),
  );
  assert.deepEqual(records, before);
});

test("renewal queue handles UTC leap boundaries, empty records and invalid input", () => {
  const queue = C.renewalQueue(
    [contract({ renewalDate: "2024-03-01", noticeDays: 1 })],
    "2024-03-01",
  );
  assert.equal(queue[0].noticeLabel, "overdue 1 day");
  assert.equal(queue[0].daysUntilNotice, -1);
  assert.equal(queue[0].status, "renewal-due");
  assert.deepEqual(C.renewalQueue([], "2026-11-03", true), []);
  assert.throws(() => C.renewalQueue([], "2026-02-29"), /asOfDate/i);
  assert.throws(
    () => C.renewalQueue([contract(), contract()], "2026-11-03"),
    /duplicate/i,
  );
});

test("JSON export validates and preserves literal text as plain pretty JSON", () => {
  const input = [contract({ notes: '<script>"example"</script>\n=1+1' })];
  const json = contractsJSON(input);
  assert.deepEqual(JSON.parse(json), input);
  assert.match(json, /\n  \{/);
  assert.throws(() => contractsJSON([contract({ owner: "" })]), /owner/i);
});

test("bundled examples are explicitly illustrative provider records due at reference date", async () => {
  const example = JSON.parse(
    await readFile(
      new URL("../data/contracts.example.json", import.meta.url),
      "utf8",
    ),
  );
  const result = validateContracts(example);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map((c) => c.provider).sort(), [
    "aws",
    "azure",
    "equinix",
    "gcp",
  ]);
  for (const c of result) {
    assert.match(c.id, /^DEMO-/);
    assert.equal(c.illustrative, true);
    assert.match(c.term, /illustrative/i);
    assert.match(c.notes, /illustrative/i);
    assert.equal(c.noticeDays, 30);
    const status = contractStatus(c, "2026-11-03");
    assert.equal(status.status, "renewal-due");
    assert.ok(status.daysUntilRenewal >= 0 && status.daysUntilRenewal <= 30);
  }
});

test("registry identity follows the loaded snapshot provenance across reconnects", () => {
  const loaded = {
    id: "prod",
    label: "Production",
    connection: "https://companion-a.example",
  };
  assert.equal(typeof C.contractRegistryKey, "function");
  const key = C.contractRegistryKey(loaded);
  assert.equal(C.contractRegistryKey({ ...loaded }), key);
  assert.notEqual(
    C.contractRegistryKey({
      ...loaded,
      connection: "https://companion-b.example",
    }),
    key,
  );
  assert.equal(
    C.contractRegistryKey({
      id: "upload",
      label: "billing.csv",
      connection: "irrelevant",
    }),
    C.contractRegistryKey({ id: "upload", label: "billing.csv" }),
  );
});

test("maximum-sized Unicode and escaped contract exports can be imported again", () => {
  assert.equal(typeof C.parseContractsJSON, "function");
  for (const notes of ["界".repeat(1000), "\u0000".repeat(1000)]) {
    const records = Array.from({ length: 50 }, (_, i) =>
      contract({ id: `record-${i}`, notes }),
    );
    const text = contractsJSON(records);
    assert.ok(new TextEncoder().encode(text).length > 128 * 1024);
    assert.deepEqual(C.parseContractsJSON(text), validateContracts(records));
  }
  assert.throws(
    () => C.parseContractsJSON(" ".repeat(512 * 1024 + 1)),
    /512 KB/,
  );
});
