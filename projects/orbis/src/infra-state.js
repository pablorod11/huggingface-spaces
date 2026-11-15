import { defaultFilters, validateFilters } from "./infra.js?v=4.0";
export const STORAGE_KEY = "ledgerline-infra-v2";
export const TABS = ["executive", "capacity", "economics"];
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const safeName = (v) =>
  typeof v === "string" &&
  v.trim().length &&
  v.length <= 80 &&
  !["__proto__", "constructor", "prototype"].includes(v);
export function restoreInfraState(input) {
  input = object(input) ? input : {};
  const profiles = Object.create(null);
  for (const [name, value] of Object.entries(
    object(input.profiles) ? input.profiles : {},
  ).slice(0, 30)) {
    if (!safeName(name) || !object(value)) continue;
    profiles[name] = {
      bookmarks: (Array.isArray(value.bookmarks) ? value.bookmarks : [])
        .slice(0, 30)
        .flatMap((b, i) =>
          object(b) && safeName(b.name)
            ? [
                {
                  id: `${i}`,
                  name: b.name.trim(),
                  filters: validateFilters(b.filters),
                  tab: TABS.includes(b.tab) ? b.tab : "executive",
                },
              ]
            : [],
        ),
    };
  }
  const profile = safeName(input.profile) ? input.profile : "My workspace";
  profiles[profile] ||= { bookmarks: [] };
  return {
    v: 2,
    filters: validateFilters(input.filters ?? defaultFilters()),
    tab: TABS.includes(input.tab) ? input.tab : "executive",
    profile,
    profiles,
  };
}
export function readInfraState(storage) {
  try {
    return restoreInfraState(JSON.parse(storage?.getItem(STORAGE_KEY)));
  } catch {
    return restoreInfraState(null);
  }
}
export function writeInfraState(storage, state) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(restoreInfraState(state)));
    return !!storage;
  } catch {
    return false;
  }
}
export function shareInfraState(state, base) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set(
    "infra",
    JSON.stringify({
      v: 2,
      filters: validateFilters(state.filters),
      tab: TABS.includes(state.tab) ? state.tab : "executive",
    }),
  );
  return url.href;
}
export function parseSharedInfraState(url) {
  try {
    const raw = JSON.parse(new URL(url).searchParams.get("infra"));
    return object(raw) && raw.v === 2
      ? {
          filters: validateFilters(raw.filters),
          tab: TABS.includes(raw.tab) ? raw.tab : "executive",
        }
      : null;
  } catch {
    return null;
  }
}
/** Keep snapshot and runner actions bound to the same explicitly selected source. */
export function reconcileCompanionSource(sources, selected) {
  const ids = (Array.isArray(sources) ? sources : []).flatMap((s) =>
    typeof s?.id === "string" && s.id ? [s.id] : [],
  );
  return ids.includes(selected) ? selected : ids[0] || "";
}
