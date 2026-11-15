/** Guard persisted browser preferences before any UI reads them. No secrets belong here. */
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const name = (v, max) =>
  typeof v === "string" &&
  v.trim().length > 0 &&
  v.length <= max &&
  !["__proto__", "constructor", "prototype"].includes(v);
const views = [
  "overview",
  "explore",
  "scenarios",
  "health",
  "connections",
  "exports",
];
const dimensions = ["region", "country", "channel", "category", "product"];
export function restorePreferences(input, validateState) {
  let recovered = false;
  if (!object(input)) {
    input = {};
    recovered = true;
  }
  const cleanBookmarks = (value) => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      recovered = true;
      return [];
    }
    if (value.length > 30) recovered = true;
    return value.slice(0, 30).flatMap((b, i) => {
      try {
        if (
          !object(b) ||
          !name(b.name, 80) ||
          !object(b.state) ||
          (b.v !== undefined && b.v !== 1) ||
          (b.id !== undefined &&
            (!name(b.id, 100) || !/^[\w-]+$/.test(b.id))) ||
          (b.view !== undefined && !views.includes(b.view)) ||
          (b.ranking !== undefined && !dimensions.includes(b.ranking))
        )
          throw Error("Invalid bookmark");
        return [
          {
            v: 1,
            id: b.id || `restored-${i}`,
            name: b.name.trim(),
            state: validateState(b.state),
            view: b.view || "overview",
            ranking: b.ranking || "region",
          },
        ];
      } catch {
        recovered = true;
        return [];
      }
    });
  };
  const profiles = Object.create(null);
  if (input.profiles !== undefined && !object(input.profiles)) recovered = true;
  if (object(input.profiles)) {
    const entries = Object.entries(input.profiles);
    if (entries.length > 30) recovered = true;
    for (const [key, p] of entries.slice(0, 30)) {
      if (!name(key, 60) || !object(p)) {
        recovered = true;
        continue;
      }
      if (p.compact !== undefined && typeof p.compact !== "boolean")
        recovered = true;
      profiles[key] = {
        bookmarks: cleanBookmarks(p.bookmarks),
        compact: p.compact === true,
      };
    }
  }
  let profile = name(input.profile, 60) ? input.profile : "My workspace";
  if (input.profile !== undefined && !name(input.profile, 60)) recovered = true;
  if (!Object.hasOwn(profiles, profile))
    profiles[profile] = {
      bookmarks: cleanBookmarks(input.bookmarks),
      compact: input.compact === true,
    };
  return {
    profiles,
    profile,
    bookmarks: profiles[profile].bookmarks,
    compact: profiles[profile].compact,
    recovered,
  };
}
