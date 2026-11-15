import test from "node:test";
import assert from "node:assert/strict";
import { restorePreferences } from "../src/state.js";
const validate = (s) => {
  if (s.preset === "custom" && !s.start) throw Error("Invalid custom range");
  return { preset: s.preset || "90d" };
};
const good = {
  v: 1,
  id: "good-1",
  name: "Revenue",
  state: { preset: "90d" },
  view: "explore",
  ranking: "category",
};
test("malformed nested profiles and bookmarks are skipped without losing valid entries", () => {
  const r = restorePreferences(
    {
      profile: "Work",
      profiles: {
        Work: {
          bookmarks: [
            null,
            1,
            [],
            {},
            good,
            { ...good, state: null },
            { ...good, v: 9 },
            { ...good, view: "bad" },
            { ...good, ranking: "bad" },
            { ...good, id: "<bad>" },
            { ...good, state: { preset: "custom" } },
          ],
        },
        Broken: null,
      },
    },
    validate,
  );
  assert.equal(r.recovered, true);
  assert.equal(r.profile, "Work");
  assert.deepEqual(r.bookmarks, [good]);
  assert.equal(Object.hasOwn(r.profiles, "Broken"), false);
});
test("null and array outer preferences recover to a usable default profile", () => {
  for (const v of [null, [], 4, "bad"]) {
    const r = restorePreferences(v, validate);
    assert.equal(r.recovered, true);
    assert.deepEqual(r.bookmarks, []);
    assert.equal(r.profile, "My workspace");
  }
});
test("separate profile settings and legacy bookmarks survive validated migration", () => {
  const r = restorePreferences(
    {
      profile: "Personal",
      profiles: {
        Work: { compact: true, bookmarks: [good] },
        Personal: {
          compact: false,
          bookmarks: [{ name: "Old view", state: {} }],
        },
      },
    },
    validate,
  );
  assert.equal(r.recovered, false);
  assert.equal(r.compact, false);
  assert.equal(r.bookmarks[0].v, 1);
  assert.equal(r.bookmarks[0].view, "overview");
  assert.equal(r.profiles.Work.bookmarks[0].view, "explore");
});
test("profile and bookmark bounds reject prototype keys, excessive names and invalid fields", () => {
  const payload = JSON.parse(
    '{"profile":"__proto__","profiles":{"__proto__":{"bookmarks":[]},"Good":{"bookmarks":[null],"compact":"yes"}}}',
  );
  const r = restorePreferences(payload, validate);
  assert.equal(Object.getPrototypeOf(r.profiles), null);
  assert.equal(r.profile, "My workspace");
  assert.equal(Object.hasOwn(r.profiles, "__proto__"), false);
  assert.equal(r.profiles.Good.compact, false);
  assert.equal(r.recovered, true);
  const bounded = restorePreferences(
    { bookmarks: Array.from({ length: 35 }, () => good) },
    validate,
  );
  assert.equal(bounded.bookmarks.length, 30);
  assert.equal(bounded.recovered, true);
});
