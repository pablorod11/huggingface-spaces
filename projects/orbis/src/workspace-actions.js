import { restoreInfraState, writeInfraState } from "./infra-state.js?v=4.0";

/** Commit preference changes without exposing an unsaved draft to the UI. */
export function saveWorkspaceChange(state, storage, mutate) {
  const draft = structuredClone(state);
  mutate(draft);
  const next = restoreInfraState(draft);
  if (!writeInfraState(storage, next))
    throw Error(
      "Workspace changes could not be saved. Enable browser storage or free space, then try again.",
    );
  return next;
}
