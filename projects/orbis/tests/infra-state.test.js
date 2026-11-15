import test from "node:test";
import assert from "node:assert/strict";
import {
  readInfraState,
  restoreInfraState,
  writeInfraState,
  shareInfraState,
  parseSharedInfraState,
  STORAGE_KEY,
  reconcileCompanionSource,
} from "../src/infra-state.js";
test("new state defaults and corrupt storage remain usable", () => {
  assert.equal(
    readInfraState({
      getItem() {
        throw Error();
      },
    }).filters.range,
    "30d",
  );
  assert.equal(restoreInfraState({ tab: "health" }).tab, "executive");
});
test("validated filters and selected tab roundtrip through storage and URL", () => {
  const state = restoreInfraState({
    tab: "capacity",
    filters: {
      range: "24h",
      providers: ["aws", "unknown"],
      regions: ["us-east-1"],
      environments: ["production"],
      tiers: ["enterprise"],
    },
  });
  let value;
  const store = {
    setItem(k, v) {
      assert.equal(k, STORAGE_KEY);
      value = v;
    },
    getItem() {
      return value;
    },
  };
  assert.equal(writeInfraState(store, state), true);
  assert.deepEqual(readInfraState(store).filters.providers, ["aws"]);
  assert.deepEqual(
    parseSharedInfraState(shareInfraState(state, "https://example.com/?old=1"))
      .filters,
    state.filters,
  );
  assert.equal(
    parseSharedInfraState("https://example.com/?infra=garbage"),
    null,
  );
});
test("bookmarks sanitize invalid shapes and prototype names", () => {
  const s = restoreInfraState({
    profiles: {
      valid: {
        bookmarks: [
          null,
          { name: "Saved", filters: { range: "yoy" }, tab: "economics" },
          { name: "" },
        ],
      },
    },
    profile: "valid",
  });
  assert.equal(s.profiles.valid.bookmarks.length, 1);
  assert.equal(s.profiles.valid.bookmarks[0].filters.range, "yoy");
  assert.equal(
    writeInfraState(
      {
        setItem() {
          throw Error();
        },
      },
      s,
    ),
    false,
  );
});

test("companion source selection survives re-render and refresh, reconciles removal", () => {
  const sources = [{ id: "A" }, { id: "B" }];
  let selected = reconcileCompanionSource(sources, "");
  assert.equal(selected, "A");
  selected = "B";
  assert.equal(reconcileCompanionSource(sources, selected), "B");
  assert.equal(reconcileCompanionSource([...sources].reverse(), selected), "B");
  assert.equal(reconcileCompanionSource([{ id: "A" }], selected), "A");
  assert.equal(reconcileCompanionSource([], selected), "");
});
