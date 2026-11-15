import test from "node:test";
import assert from "node:assert/strict";
import { saveWorkspaceChange } from "../src/workspace-actions.js";
import { restoreInfraState, STORAGE_KEY } from "../src/infra-state.js";

const originalState = () =>
  restoreInfraState({
    profile: "Operations",
    profiles: {
      Operations: {
        bookmarks: [
          { name: "Capacity", tab: "capacity", filters: { range: "7d" } },
        ],
      },
      Finance: {
        bookmarks: [
          { name: "Margins", tab: "economics", filters: { range: "yoy" } },
        ],
      },
    },
  });

test("blocked or quota-limited storage leaves the original workspace intact", () => {
  for (const storage of [
    undefined,
    {
      setItem() {
        throw Error("QuotaExceededError");
      },
    },
  ]) {
    const state = originalState();
    const before = structuredClone(state);
    assert.throws(
      () =>
        saveWorkspaceChange(state, storage, (draft) => {
          draft.profiles.Operations.bookmarks.splice(0, 1);
          draft.profile = "Finance";
        }),
      /could not be saved.*browser storage/i,
    );
    assert.deepEqual(structuredClone(state), before);
  }
});

test("successful changes return normalized isolated state and persist all profiles and bookmarks", () => {
  const state = originalState();
  const before = structuredClone(state);
  let persisted;
  const next = saveWorkspaceChange(
    state,
    {
      setItem(key, value) {
        assert.equal(key, STORAGE_KEY);
        persisted = JSON.parse(value);
      },
    },
    (draft) => {
      draft.profiles.Operations.bookmarks.push({
        name: "  Review  ",
        tab: "invalid",
        filters: { range: "24h", providers: ["aws", "invalid"] },
      });
      draft.profile = "Finance";
    },
  );
  assert.deepEqual(structuredClone(state), before);
  assert.notEqual(next, state);
  assert.deepEqual(JSON.parse(JSON.stringify(next)), persisted);
  assert.deepEqual(
    next.profiles.Finance.bookmarks,
    state.profiles.Finance.bookmarks,
  );
  assert.deepEqual(
    next.profiles.Operations.bookmarks[0],
    state.profiles.Operations.bookmarks[0],
  );
  assert.equal(next.profiles.Operations.bookmarks[1].name, "Review");
  assert.equal(next.profiles.Operations.bookmarks[1].tab, "executive");
  assert.deepEqual(next.profiles.Operations.bookmarks[1].filters.providers, [
    "aws",
  ]);
  next.profiles.Operations.bookmarks[0].filters.range = "30d";
  assert.equal(state.profiles.Operations.bookmarks[0].filters.range, "7d");
});

test("mutation errors never write or change the original workspace", () => {
  const state = originalState();
  const before = structuredClone(state);
  let writes = 0;
  assert.throws(
    () =>
      saveWorkspaceChange(
        state,
        {
          setItem() {
            writes++;
          },
        },
        (draft) => {
          draft.profiles.Operations.bookmarks.pop();
          throw Error("Invalid workspace action");
        },
      ),
    /Invalid workspace action/,
  );
  assert.equal(writes, 0);
  assert.deepEqual(structuredClone(state), before);
});
