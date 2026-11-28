import { parseScopedThreadKey, scopedThreadKey } from "@s1tools/client-runtime/environment";
import { type ScopedThreadRef } from "@s1tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { resolveStorage } from "./lib/storage";
import { MAX_TERMINALS_PER_GROUP, type ThreadTerminalGroup } from "./types";

/** The thread's terminals and how they split; the terminal pane shows them. */
interface ThreadTerminalUiState {
  terminalIds: string[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
  activeTerminalGroupId: string;
}

const TERMINAL_UI_STATE_STORAGE_KEY = "s1code:terminal-state:v1";

interface PersistedTerminalUiStateStoreState {
  terminalUiStateByThreadKey?: Record<string, ThreadTerminalUiState>;
  terminalStateByThreadKey?: Record<string, ThreadTerminalUiState>;
}

export function migratePersistedTerminalUiStateStoreState(
  persistedState: unknown,
  _version: number,
): PersistedTerminalUiStateStoreState {
  if (!persistedState || typeof persistedState !== "object") {
    return { terminalUiStateByThreadKey: {} };
  }

  const candidate = persistedState as PersistedTerminalUiStateStoreState;
  const persistedUiStateByThreadKey =
    candidate.terminalUiStateByThreadKey ?? candidate.terminalStateByThreadKey ?? {};
  // Version 5 dropped the bottom drawer's open flag and height; the terminal pane replaced it.
  const terminalUiStateByThreadKey = Object.fromEntries(
    Object.entries(persistedUiStateByThreadKey)
      .filter(
        ([threadKey, saved]) =>
          parseScopedThreadKey(threadKey) !== null && saved !== null && typeof saved === "object",
      )
      .map(
        ([threadKey, { terminalIds, activeTerminalId, terminalGroups, activeTerminalGroupId }]) => [
          threadKey,
          { terminalIds, activeTerminalId, terminalGroups, activeTerminalGroupId },
        ],
      ),
  );

  return { terminalUiStateByThreadKey };
}

function createTerminalUiStateStorage() {
  return resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined);
}

function normalizeTerminalIds(terminalIds: string[]): string[] {
  const normalizedIds: string[] = [];
  const seen = new Set<string>();
  for (const id of terminalIds) {
    const trimmedId = id.trim();
    if (trimmedId.length === 0 || seen.has(trimmedId)) continue;
    seen.add(trimmedId);
    normalizedIds.push(trimmedId);
  }
  return normalizedIds;
}

function fallbackGroupId(terminalId: string): string {
  return `group-${terminalId}`;
}

function assignUniqueGroupId(baseId: string, usedGroupIds: Set<string>): string {
  let candidate = baseId;
  let index = 2;
  while (usedGroupIds.has(candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }
  usedGroupIds.add(candidate);
  return candidate;
}

function findGroupIndexByTerminalId(
  terminalGroups: ThreadTerminalGroup[],
  terminalId: string,
): number {
  return terminalGroups.findIndex((group) => group.terminalIds.includes(terminalId));
}

function normalizeTerminalGroupIds(terminalIds: string[]): string[] {
  return normalizeTerminalIds(terminalIds);
}

function normalizeTerminalGroups(
  terminalGroups: ThreadTerminalGroup[],
  terminalIds: string[],
): ThreadTerminalGroup[] {
  if (terminalIds.length === 0) {
    return [];
  }

  const validTerminalIdSet = new Set(terminalIds);
  const assignedTerminalIds = new Set<string>();
  const nextGroups: ThreadTerminalGroup[] = [];
  const usedGroupIds = new Set<string>();

  for (const group of terminalGroups) {
    const groupTerminalIds = normalizeTerminalGroupIds(group.terminalIds).filter((terminalId) => {
      if (!validTerminalIdSet.has(terminalId)) return false;
      if (assignedTerminalIds.has(terminalId)) return false;
      return true;
    });
    if (groupTerminalIds.length === 0) continue;
    for (const terminalId of groupTerminalIds) {
      assignedTerminalIds.add(terminalId);
    }
    const baseGroupId =
      group.id.trim().length > 0
        ? group.id.trim()
        : fallbackGroupId(groupTerminalIds[0] ?? terminalIds[0] ?? "");
    nextGroups.push({
      id: assignUniqueGroupId(baseGroupId, usedGroupIds),
      terminalIds: groupTerminalIds,
      ...(group.splitDirection === "vertical" ? { splitDirection: "vertical" as const } : {}),
    });
  }

  for (const terminalId of terminalIds) {
    if (assignedTerminalIds.has(terminalId)) continue;
    nextGroups.push({
      id: assignUniqueGroupId(fallbackGroupId(terminalId), usedGroupIds),
      terminalIds: [terminalId],
    });
  }

  return nextGroups;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function terminalGroupsEqual(left: ThreadTerminalGroup[], right: ThreadTerminalGroup[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const leftGroup = left[index];
    const rightGroup = right[index];
    if (!leftGroup || !rightGroup) return false;
    if (leftGroup.id !== rightGroup.id) return false;
    if (
      (leftGroup.splitDirection ?? "horizontal") !== (rightGroup.splitDirection ?? "horizontal")
    ) {
      return false;
    }
    if (!arraysEqual(leftGroup.terminalIds, rightGroup.terminalIds)) return false;
  }
  return true;
}

function threadTerminalUiStateEqual(
  left: ThreadTerminalUiState,
  right: ThreadTerminalUiState,
): boolean {
  return (
    left.activeTerminalId === right.activeTerminalId &&
    left.activeTerminalGroupId === right.activeTerminalGroupId &&
    arraysEqual(left.terminalIds, right.terminalIds) &&
    terminalGroupsEqual(left.terminalGroups, right.terminalGroups)
  );
}

const DEFAULT_THREAD_TERMINAL_UI_STATE: ThreadTerminalUiState = Object.freeze({
  terminalIds: [],
  activeTerminalId: "",
  terminalGroups: [],
  activeTerminalGroupId: "",
});

function createDefaultThreadTerminalUiState(): ThreadTerminalUiState {
  return {
    ...DEFAULT_THREAD_TERMINAL_UI_STATE,
    terminalIds: [...DEFAULT_THREAD_TERMINAL_UI_STATE.terminalIds],
    terminalGroups: copyTerminalGroups(DEFAULT_THREAD_TERMINAL_UI_STATE.terminalGroups),
  };
}

function getDefaultThreadTerminalUiState(): ThreadTerminalUiState {
  return DEFAULT_THREAD_TERMINAL_UI_STATE;
}

function normalizeThreadTerminalUiState(state: ThreadTerminalUiState): ThreadTerminalUiState {
  const nextTerminalIds = normalizeTerminalIds(state.terminalIds);
  const activeTerminalId = nextTerminalIds.includes(state.activeTerminalId)
    ? state.activeTerminalId
    : (nextTerminalIds[0] ?? "");
  const terminalGroups = normalizeTerminalGroups(state.terminalGroups, nextTerminalIds);
  const activeGroupIdFromState = terminalGroups.some(
    (group) => group.id === state.activeTerminalGroupId,
  )
    ? state.activeTerminalGroupId
    : null;
  const activeGroupIdFromTerminal =
    terminalGroups.find((group) => group.terminalIds.includes(activeTerminalId))?.id ?? null;

  const normalized: ThreadTerminalUiState = {
    terminalIds: nextTerminalIds,
    activeTerminalId,
    terminalGroups,
    activeTerminalGroupId:
      activeGroupIdFromState ?? activeGroupIdFromTerminal ?? terminalGroups[0]?.id ?? "",
  };
  return threadTerminalUiStateEqual(state, normalized) ? state : normalized;
}

function isDefaultThreadTerminalUiState(state: ThreadTerminalUiState): boolean {
  const normalized = normalizeThreadTerminalUiState(state);
  return threadTerminalUiStateEqual(normalized, DEFAULT_THREAD_TERMINAL_UI_STATE);
}

function isValidTerminalId(terminalId: string): boolean {
  return terminalId.trim().length > 0;
}

function terminalThreadKey(threadRef: ScopedThreadRef): string {
  return scopedThreadKey(threadRef);
}

function copyTerminalGroups(groups: ThreadTerminalGroup[]): ThreadTerminalGroup[] {
  return groups.map((group) => ({
    id: group.id,
    terminalIds: [...group.terminalIds],
    ...(group.splitDirection === "vertical" ? { splitDirection: "vertical" as const } : {}),
  }));
}

function upsertTerminalIntoGroups(
  state: ThreadTerminalUiState,
  terminalId: string,
  mode: "split" | "new",
  splitDirection: "horizontal" | "vertical" = "horizontal",
): ThreadTerminalUiState {
  const normalized = normalizeThreadTerminalUiState(state);
  const effectiveMode: "split" | "new" = normalized.terminalIds.length === 0 ? "new" : mode;
  if (!isValidTerminalId(terminalId)) {
    return normalized;
  }

  const isNewTerminal = !normalized.terminalIds.includes(terminalId);
  const terminalIds = isNewTerminal
    ? [...normalized.terminalIds, terminalId]
    : normalized.terminalIds;
  const terminalGroups = copyTerminalGroups(normalized.terminalGroups);

  const existingGroupIndex = findGroupIndexByTerminalId(terminalGroups, terminalId);
  if (existingGroupIndex >= 0) {
    terminalGroups[existingGroupIndex]!.terminalIds = terminalGroups[
      existingGroupIndex
    ]!.terminalIds.filter((id) => id !== terminalId);
    if (terminalGroups[existingGroupIndex]!.terminalIds.length === 0) {
      terminalGroups.splice(existingGroupIndex, 1);
    }
  }

  if (effectiveMode === "new") {
    const usedGroupIds = new Set(terminalGroups.map((group) => group.id));
    const nextGroupId = assignUniqueGroupId(fallbackGroupId(terminalId), usedGroupIds);
    terminalGroups.push({ id: nextGroupId, terminalIds: [terminalId] });
    return normalizeThreadTerminalUiState({
      ...normalized,
      terminalIds,
      activeTerminalId: terminalId,
      terminalGroups,
      activeTerminalGroupId: nextGroupId,
    });
  }

  let activeGroupIndex = terminalGroups.findIndex(
    (group) => group.id === normalized.activeTerminalGroupId,
  );
  if (activeGroupIndex < 0) {
    activeGroupIndex = findGroupIndexByTerminalId(terminalGroups, normalized.activeTerminalId);
  }
  if (activeGroupIndex < 0) {
    const usedGroupIds = new Set(terminalGroups.map((group) => group.id));
    const nextGroupId = assignUniqueGroupId(
      fallbackGroupId(normalized.activeTerminalId),
      usedGroupIds,
    );
    terminalGroups.push({ id: nextGroupId, terminalIds: [normalized.activeTerminalId] });
    activeGroupIndex = terminalGroups.length - 1;
  }

  const destinationGroup = terminalGroups[activeGroupIndex];
  if (!destinationGroup) {
    return normalized;
  }
  const destinationTerminalIdSet = new Set(destinationGroup.terminalIds);

  if (
    isNewTerminal &&
    !destinationTerminalIdSet.has(terminalId) &&
    destinationGroup.terminalIds.length >= MAX_TERMINALS_PER_GROUP
  ) {
    return normalized;
  }

  if (!destinationTerminalIdSet.has(terminalId)) {
    const anchorIndex = destinationGroup.terminalIds.indexOf(normalized.activeTerminalId);
    if (anchorIndex >= 0) {
      destinationGroup.terminalIds.splice(anchorIndex + 1, 0, terminalId);
    } else {
      destinationGroup.terminalIds.push(terminalId);
    }
  }
  if (splitDirection === "vertical") {
    destinationGroup.splitDirection = "vertical";
  } else {
    delete destinationGroup.splitDirection;
  }

  return normalizeThreadTerminalUiState({
    ...normalized,
    terminalIds,
    activeTerminalId: terminalId,
    terminalGroups,
    activeTerminalGroupId: destinationGroup.id,
  });
}

function splitThreadTerminal(
  state: ThreadTerminalUiState,
  terminalId: string,
  direction: "horizontal" | "vertical" = "horizontal",
): ThreadTerminalUiState {
  return upsertTerminalIntoGroups(state, terminalId, "split", direction);
}

function newThreadTerminal(
  state: ThreadTerminalUiState,
  terminalId: string,
): ThreadTerminalUiState {
  return upsertTerminalIntoGroups(state, terminalId, "new");
}

function setThreadActiveTerminal(
  state: ThreadTerminalUiState,
  terminalId: string,
): ThreadTerminalUiState {
  const normalized = normalizeThreadTerminalUiState(state);
  if (!normalized.terminalIds.includes(terminalId)) {
    return normalized;
  }
  const activeTerminalGroupId =
    normalized.terminalGroups.find((group) => group.terminalIds.includes(terminalId))?.id ??
    normalized.activeTerminalGroupId;
  if (
    normalized.activeTerminalId === terminalId &&
    normalized.activeTerminalGroupId === activeTerminalGroupId
  ) {
    return normalized;
  }
  return {
    ...normalized,
    activeTerminalId: terminalId,
    activeTerminalGroupId,
  };
}

function closeThreadTerminal(
  state: ThreadTerminalUiState,
  terminalId: string,
): ThreadTerminalUiState {
  const normalized = normalizeThreadTerminalUiState(state);
  if (!normalized.terminalIds.includes(terminalId)) {
    return normalized;
  }

  const remainingTerminalIds = normalized.terminalIds.filter((id) => id !== terminalId);
  if (remainingTerminalIds.length === 0) {
    return createDefaultThreadTerminalUiState();
  }

  const closedTerminalIndex = normalized.terminalIds.indexOf(terminalId);
  const groupTerminalIds =
    normalized.terminalGroups.find((group) => group.terminalIds.includes(terminalId))
      ?.terminalIds ?? [];
  const groupIndex = groupTerminalIds.indexOf(terminalId);
  const nextActiveTerminalId =
    normalized.activeTerminalId === terminalId
      ? (groupTerminalIds[groupIndex + 1] ??
        groupTerminalIds[groupIndex - 1] ??
        remainingTerminalIds[Math.min(closedTerminalIndex, remainingTerminalIds.length - 1)] ??
        remainingTerminalIds[0] ??
        "")
      : normalized.activeTerminalId;

  const terminalGroups: ThreadTerminalGroup[] = [];
  for (const group of normalized.terminalGroups) {
    const terminalIds = group.terminalIds.filter((id) => id !== terminalId);
    if (terminalIds.length > 0) {
      terminalGroups.push({ ...group, terminalIds });
    }
  }

  const nextActiveTerminalGroupId =
    terminalGroups.find((group) => group.terminalIds.includes(nextActiveTerminalId))?.id ??
    terminalGroups[0]?.id ??
    fallbackGroupId(nextActiveTerminalId);

  return normalizeThreadTerminalUiState({
    terminalIds: remainingTerminalIds,
    activeTerminalId: nextActiveTerminalId,
    terminalGroups,
    activeTerminalGroupId: nextActiveTerminalGroupId,
  });
}

/** Adds shells kept elsewhere as their own split, showing the one that was active there. */
function importThreadTerminalGroup(
  state: ThreadTerminalUiState,
  group: TerminalGroupImport,
): ThreadTerminalUiState {
  const normalized = normalizeThreadTerminalUiState(state);
  const added = normalizeTerminalIds([...group.terminalIds]).filter(
    (id) => !normalized.terminalIds.includes(id),
  );
  if (added.length === 0) return normalized;
  const groups: ThreadTerminalGroup[] = [];
  for (let index = 0; index < added.length; index += MAX_TERMINALS_PER_GROUP) {
    const terminalIds = added.slice(index, index + MAX_TERMINALS_PER_GROUP);
    groups.push({
      id: fallbackGroupId(terminalIds[0]!),
      terminalIds,
      ...(group.splitDirection === "vertical" ? { splitDirection: "vertical" as const } : {}),
    });
  }
  return normalizeThreadTerminalUiState({
    terminalIds: [...normalized.terminalIds, ...added],
    terminalGroups: [...normalized.terminalGroups, ...groups],
    activeTerminalId: added.includes(group.activeTerminalId) ? group.activeTerminalId : added[0]!,
    activeTerminalGroupId: "",
  });
}

function reconcileThreadTerminalSessionIds(
  state: ThreadTerminalUiState,
  serverIds: string[],
  previousServerIds: readonly string[],
): ThreadTerminalUiState {
  const normalized = normalizeThreadTerminalUiState(state);
  const serverIdSet = new Set(serverIds);
  const localIdSet = new Set(normalized.terminalIds);
  const added = serverIds.filter((id) => !localIdSet.has(id));
  let next =
    added.length === 0
      ? normalized
      : normalizeThreadTerminalUiState({
          ...normalized,
          terminalIds: [...normalized.terminalIds, ...added],
        });

  for (const id of previousServerIds) {
    if (id !== normalized.activeTerminalId && !serverIdSet.has(id)) {
      next = closeThreadTerminal(next, id);
    }
  }
  if (
    !serverIdSet.has(normalized.activeTerminalId) &&
    previousServerIds.includes(normalized.activeTerminalId)
  ) {
    next = closeThreadTerminal(next, normalized.activeTerminalId);
  }
  return next;
}

export function selectThreadTerminalUiState(
  terminalUiStateByThreadKey: Record<string, ThreadTerminalUiState>,
  threadRef: ScopedThreadRef | null | undefined,
): ThreadTerminalUiState {
  if (!threadRef || threadRef.threadId.length === 0) {
    return getDefaultThreadTerminalUiState();
  }
  return (
    terminalUiStateByThreadKey[terminalThreadKey(threadRef)] ?? getDefaultThreadTerminalUiState()
  );
}

function updateTerminalUiStateByThreadKey(
  terminalUiStateByThreadKey: Record<string, ThreadTerminalUiState>,
  threadRef: ScopedThreadRef,
  updater: (state: ThreadTerminalUiState) => ThreadTerminalUiState,
): Record<string, ThreadTerminalUiState> {
  if (threadRef.threadId.length === 0) {
    return terminalUiStateByThreadKey;
  }

  const threadKey = terminalThreadKey(threadRef);
  const current = selectThreadTerminalUiState(terminalUiStateByThreadKey, threadRef);
  const next = updater(current);
  if (next === current) {
    return terminalUiStateByThreadKey;
  }

  if (isDefaultThreadTerminalUiState(next)) {
    if (terminalUiStateByThreadKey[threadKey] === undefined) {
      return terminalUiStateByThreadKey;
    }
    const { [threadKey]: _removed, ...rest } = terminalUiStateByThreadKey;
    return rest;
  }

  return {
    ...terminalUiStateByThreadKey,
    [threadKey]: next,
  };
}

function updateSuppressedTerminalId(
  suppressedTerminalIdsByThreadKey: Record<string, string[]>,
  threadRef: ScopedThreadRef,
  terminalId: string,
  suppressed: boolean,
): Record<string, string[]> {
  const normalizedTerminalId = terminalId.trim();
  if (normalizedTerminalId.length === 0) {
    return suppressedTerminalIdsByThreadKey;
  }
  const threadKey = terminalThreadKey(threadRef);
  const currentIds = suppressedTerminalIdsByThreadKey[threadKey] ?? [];
  const currentlySuppressed = currentIds.includes(normalizedTerminalId);
  if (currentlySuppressed === suppressed) {
    return suppressedTerminalIdsByThreadKey;
  }
  if (suppressed) {
    return {
      ...suppressedTerminalIdsByThreadKey,
      [threadKey]: [...currentIds, normalizedTerminalId],
    };
  }

  const remainingIds = currentIds.filter((id) => id !== normalizedTerminalId);
  if (remainingIds.length > 0) {
    return {
      ...suppressedTerminalIdsByThreadKey,
      [threadKey]: remainingIds,
    };
  }
  return removeRecordEntry(suppressedTerminalIdsByThreadKey, threadKey);
}

function removeRecordEntry<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (record[key] === undefined) {
    return record;
  }
  const { [key]: _removed, ...remaining } = record;
  return remaining;
}

interface TerminalServerObservation {
  readonly ids: string[];
  readonly snapshotId: string | symbol | undefined;
}

function forgetObservedTerminalId(
  serverObservationsByThreadKey: Record<string, TerminalServerObservation>,
  threadKey: string,
  terminalId: string,
): Record<string, TerminalServerObservation> {
  const observation = serverObservationsByThreadKey[threadKey];
  if (!observation?.ids.includes(terminalId)) {
    return serverObservationsByThreadKey;
  }
  const ids = observation.ids.filter((id) => id !== terminalId);
  if (ids.length === 0) {
    return removeRecordEntry(serverObservationsByThreadKey, threadKey);
  }
  return { ...serverObservationsByThreadKey, [threadKey]: { ...observation, ids } };
}

export interface TerminalGroupImport {
  readonly terminalIds: readonly string[];
  readonly activeTerminalId: string;
  readonly splitDirection?: "horizontal" | "vertical";
}

interface TerminalUiStateStoreState {
  serverObservationsByThreadKey: Record<string, TerminalServerObservation>;
  terminalUiStateByThreadKey: Record<string, ThreadTerminalUiState>;
  suppressedTerminalIdsByThreadKey: Record<string, string[]>;
  splitTerminal: (threadRef: ScopedThreadRef, terminalId: string) => void;
  splitTerminalVertical: (threadRef: ScopedThreadRef, terminalId: string) => void;
  newTerminal: (threadRef: ScopedThreadRef, terminalId: string) => void;
  ensureTerminal: (
    threadRef: ScopedThreadRef,
    terminalId: string,
    options?: { active?: boolean },
  ) => void;
  setActiveTerminal: (threadRef: ScopedThreadRef, terminalId: string) => void;
  closeTerminal: (threadRef: ScopedThreadRef, terminalId: string) => void;
  reconcileTerminalIds: (
    threadRef: ScopedThreadRef,
    serverIds: string[],
    snapshotId?: string | symbol,
  ) => void;
  /** Takes in shells this store never listed, such as a pre-pane terminal tab's. */
  importTerminalGroup: (threadRef: ScopedThreadRef, group: TerminalGroupImport) => void;
  clearTerminalUiState: (threadRef: ScopedThreadRef) => void;
  removeTerminalUiState: (threadRef: ScopedThreadRef) => void;
  removeOrphanedTerminalUiStates: (activeThreadKeys: Set<string>) => void;
}

export const useTerminalUiStateStore = create<TerminalUiStateStoreState>()(
  persist(
    (set, get) => {
      const removeTerminalUiState = (threadRef: ScopedThreadRef) =>
        set((state) => {
          const threadKey = terminalThreadKey(threadRef);
          if (
            state.terminalUiStateByThreadKey[threadKey] === undefined &&
            state.suppressedTerminalIdsByThreadKey[threadKey] === undefined &&
            state.serverObservationsByThreadKey[threadKey] === undefined
          ) {
            return state;
          }
          return {
            terminalUiStateByThreadKey: removeRecordEntry(
              state.terminalUiStateByThreadKey,
              threadKey,
            ),
            suppressedTerminalIdsByThreadKey: removeRecordEntry(
              state.suppressedTerminalIdsByThreadKey,
              threadKey,
            ),
            serverObservationsByThreadKey: removeRecordEntry(
              state.serverObservationsByThreadKey,
              threadKey,
            ),
          };
        });

      const updateTerminal = (
        threadRef: ScopedThreadRef,
        updater: (state: ThreadTerminalUiState) => ThreadTerminalUiState,
        suppression?: { terminalId: string; suppressed: boolean },
      ) => {
        set((state) => {
          const nextTerminalUiStateByThreadKey = updateTerminalUiStateByThreadKey(
            state.terminalUiStateByThreadKey,
            threadRef,
            updater,
          );
          const nextSuppressedTerminalIdsByThreadKey = suppression
            ? updateSuppressedTerminalId(
                state.suppressedTerminalIdsByThreadKey,
                threadRef,
                suppression.terminalId,
                suppression.suppressed,
              )
            : state.suppressedTerminalIdsByThreadKey;
          // A listing from before this client placed the id is about an earlier terminal, so it
          // must not make reconcile close the new one.
          const nextServerObservationsByThreadKey =
            suppression &&
            !suppression.suppressed &&
            !selectThreadTerminalUiState(
              state.terminalUiStateByThreadKey,
              threadRef,
            ).terminalIds.includes(suppression.terminalId)
              ? forgetObservedTerminalId(
                  state.serverObservationsByThreadKey,
                  terminalThreadKey(threadRef),
                  suppression.terminalId,
                )
              : state.serverObservationsByThreadKey;
          if (
            nextTerminalUiStateByThreadKey === state.terminalUiStateByThreadKey &&
            nextSuppressedTerminalIdsByThreadKey === state.suppressedTerminalIdsByThreadKey &&
            nextServerObservationsByThreadKey === state.serverObservationsByThreadKey
          ) {
            return state;
          }
          return {
            terminalUiStateByThreadKey: nextTerminalUiStateByThreadKey,
            suppressedTerminalIdsByThreadKey: nextSuppressedTerminalIdsByThreadKey,
            serverObservationsByThreadKey: nextServerObservationsByThreadKey,
          };
        });
      };

      return {
        terminalUiStateByThreadKey: {},
        serverObservationsByThreadKey: {},
        suppressedTerminalIdsByThreadKey: {},
        splitTerminal: (threadRef, terminalId) =>
          updateTerminal(threadRef, (state) => splitThreadTerminal(state, terminalId), {
            terminalId,
            suppressed: false,
          }),
        splitTerminalVertical: (threadRef, terminalId) =>
          updateTerminal(threadRef, (state) => splitThreadTerminal(state, terminalId, "vertical"), {
            terminalId,
            suppressed: false,
          }),
        newTerminal: (threadRef, terminalId) =>
          updateTerminal(threadRef, (state) => newThreadTerminal(state, terminalId), {
            terminalId,
            suppressed: false,
          }),
        ensureTerminal: (threadRef, terminalId, options) =>
          updateTerminal(
            threadRef,
            (state) => {
              let nextState = state;
              if (!state.terminalIds.includes(terminalId)) {
                nextState = newThreadTerminal(nextState, terminalId);
              }
              if (options?.active === false) {
                nextState = {
                  ...nextState,
                  activeTerminalId: state.activeTerminalId,
                  activeTerminalGroupId: state.activeTerminalGroupId,
                };
              }
              if (options?.active ?? true) {
                nextState = setThreadActiveTerminal(nextState, terminalId);
              }
              return normalizeThreadTerminalUiState(nextState);
            },
            { terminalId, suppressed: false },
          ),
        setActiveTerminal: (threadRef, terminalId) =>
          updateTerminal(threadRef, (state) => setThreadActiveTerminal(state, terminalId)),
        closeTerminal: (threadRef, terminalId) =>
          updateTerminal(threadRef, (state) => closeThreadTerminal(state, terminalId), {
            terminalId,
            suppressed: true,
          }),
        reconcileTerminalIds: (threadRef, serverIds, snapshotId) => {
          if (threadRef.threadId.length === 0) return;
          const threadKey = terminalThreadKey(threadRef);
          const state = get();
          const previous = state.serverObservationsByThreadKey[threadKey];
          const suppressedIds = new Set(state.suppressedTerminalIdsByThreadKey[threadKey]);
          const terminalUiStateByThreadKey = updateTerminalUiStateByThreadKey(
            state.terminalUiStateByThreadKey,
            threadRef,
            (terminalState) =>
              reconcileThreadTerminalSessionIds(
                terminalState,
                serverIds.filter((id) => !suppressedIds.has(id)),
                // A different manager can start empty before old sessions reattach.
                previous?.snapshotId === snapshotId ? (previous?.ids ?? []) : [],
              ),
          );
          // Metadata is ordered by activity, which does not change which terminals were seen.
          const observedIds = [...serverIds].sort();
          let serverObservationsByThreadKey = state.serverObservationsByThreadKey;
          if (observedIds.length === 0) {
            serverObservationsByThreadKey = removeRecordEntry(
              serverObservationsByThreadKey,
              threadKey,
            );
          } else if (
            !previous ||
            previous.snapshotId !== snapshotId ||
            !arraysEqual(previous.ids, observedIds)
          ) {
            serverObservationsByThreadKey = {
              ...serverObservationsByThreadKey,
              [threadKey]: { ids: observedIds, snapshotId },
            };
          }
          if (
            terminalUiStateByThreadKey !== state.terminalUiStateByThreadKey ||
            serverObservationsByThreadKey !== state.serverObservationsByThreadKey
          ) {
            set({ terminalUiStateByThreadKey, serverObservationsByThreadKey });
          }
        },
        importTerminalGroup: (threadRef, group) =>
          set((state) => {
            const threadKey = terminalThreadKey(threadRef);
            const terminalUiStateByThreadKey = updateTerminalUiStateByThreadKey(
              state.terminalUiStateByThreadKey,
              threadRef,
              (current) => importThreadTerminalGroup(current, group),
            );
            const suppressed = state.suppressedTerminalIdsByThreadKey[threadKey] ?? [];
            const remaining = suppressed.filter((id) => !group.terminalIds.includes(id));
            if (
              terminalUiStateByThreadKey === state.terminalUiStateByThreadKey &&
              remaining.length === suppressed.length
            ) {
              return state;
            }
            return {
              terminalUiStateByThreadKey,
              suppressedTerminalIdsByThreadKey:
                remaining.length === 0
                  ? removeRecordEntry(state.suppressedTerminalIdsByThreadKey, threadKey)
                  : { ...state.suppressedTerminalIdsByThreadKey, [threadKey]: remaining },
            };
          }),
        clearTerminalUiState: removeTerminalUiState,
        removeTerminalUiState,
        removeOrphanedTerminalUiStates: (activeThreadKeys) =>
          set((state) => {
            const orphanedIds = new Set(
              [
                ...Object.keys(state.terminalUiStateByThreadKey),
                ...Object.keys(state.suppressedTerminalIdsByThreadKey),
                ...Object.keys(state.serverObservationsByThreadKey),
              ].filter((key) => !activeThreadKeys.has(key)),
            );
            if (orphanedIds.size === 0) {
              return state;
            }
            const nextTerminalUiStateByThreadKey = { ...state.terminalUiStateByThreadKey };
            const nextSuppressedTerminalIdsByThreadKey = {
              ...state.suppressedTerminalIdsByThreadKey,
            };
            const serverObservationsByThreadKey = { ...state.serverObservationsByThreadKey };
            for (const id of orphanedIds) {
              delete nextTerminalUiStateByThreadKey[id];
              delete nextSuppressedTerminalIdsByThreadKey[id];
              delete serverObservationsByThreadKey[id];
            }
            return {
              terminalUiStateByThreadKey: nextTerminalUiStateByThreadKey,
              suppressedTerminalIdsByThreadKey: nextSuppressedTerminalIdsByThreadKey,
              serverObservationsByThreadKey,
            };
          }),
      };
    },
    {
      name: TERMINAL_UI_STATE_STORAGE_KEY,
      version: 5,
      storage: createJSONStorage(createTerminalUiStateStorage),
      migrate: migratePersistedTerminalUiStateStoreState,
      partialize: (state) => ({
        terminalUiStateByThreadKey: state.terminalUiStateByThreadKey,
        serverObservationsByThreadKey: Object.fromEntries(
          Object.entries(state.serverObservationsByThreadKey).filter(
            ([, observation]) => typeof observation.snapshotId === "string",
          ),
        ),
      }),
    },
  ),
);
