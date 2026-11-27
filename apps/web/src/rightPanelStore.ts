import { parseScopedThreadKey, scopedThreadKey } from "@s1tools/client-runtime/environment";
import { RunId, ThreadId, type ScopedThreadRef } from "@s1tools/contracts";
import { msg } from "gt-react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { useClosedViewStore } from "./closedViewStore";
import { useTerminalUiStateStore } from "./terminalUiStateStore";
import { m } from "./i18n/messages";
import { resolveStorage } from "./lib/storage";
import type { LinkedThreadTarget } from "@s1tools/client-runtime/linked-thread";
import {
  decodeLinkedThreadSurface,
  linkedThreadSurface,
  type LinkedThreadSurface,
} from "./linkedThreadSurface";
import {
  decodeLayout,
  isPaneKind,
  layoutHasTile,
  layoutPanes,
  movePane as moveLayoutPane,
  placePane,
  removeTile,
  resetDividerSizes,
  setSplitSizes,
  type LayoutNode,
  type PaneKind,
  type PanePlacement,
  type PaneSide,
  type TileId,
} from "./paneLayout";
import type { PreviewMiniPlayerSource } from "./previewMiniPlayerStore";
import type { ChatFileAttachment } from "./types";

const RIGHT_PANEL_KINDS = [
  "diff",
  "files",
  "file",
  "preview",
  "device",
  "terminal",
  "pull-request",
  "pull-requests",
  "issue",
  "thread",
  "linked-thread",
] as const;
export type RightPanelKind = (typeof RIGHT_PANEL_KINDS)[number];

export type PullRequestDetailTab = "summary" | "guide" | "timeline" | "code";

export interface DeviceTabTarget {
  hostId: string;
  deviceId: string;
  platform: "ios" | "android";
  name: string;
}

export type RightPanelSurface =
  | { id: `browser:${string}`; kind: "preview"; resourceId: string }
  | { id: "browser:new"; kind: "preview"; resourceId: null }
  | { id: "device" | `device:${string}`; kind: "device"; target?: DeviceTabTarget; title?: string }
  /** The thread's terminals; which ones and how they split lives in the terminal UI store. */
  | { id: "terminal"; kind: "terminal" }
  | { id: "diff"; kind: "diff" }
  | {
      id: "files";
      kind: "files";
      /** Set when breadcrumbs moved a folder browser up to the workspace root. */
      folderTrail?: string;
    }
  | {
      id: `file:${string}` | `attachment:${string}`;
      kind: "file";
      relativePath: string;
      revealLine: number | null;
      revealRequestId: number;
      attachment?: ChatFileAttachment;
      /** Deepest workspace path retained for navigating back down after moving up. */
      folderTrail?: string;
    }
  | {
      id: `pull-request:${string}`;
      kind: "pull-request";
      /** Cross-environment lists can repeat project ids; thread panels inherit their ref's environment. */
      environmentId?: string;
      projectId: string;
      host?: string;
      repository: string;
      number: number;
      url?: string;
      /** A clicked link waiting for the panel to show where it points; cleared once shown. */
      revealUrl?: string;
      detailTab?: PullRequestDetailTab;
    }
  | { id: "pull-requests"; kind: "pull-requests" }
  /**
   * An issue opened beside a thread. Like `pull-request`, the reference lives in the id so the
   * issue pane can switch between several.
   */
  | {
      id: `issue:${string}`;
      kind: "issue";
      environmentId?: string;
      projectId: string;
      tracker: string;
      host?: string;
      scope: string;
      key: string;
      url?: string;
    }
  /**
   * A thread of the panel's environment shown beside it: a side chat or a subagent. Which one is
   * the thread's own lineage, so the surface only names it.
   */
  | ThreadSurface
  /** A linked environment's thread, read through `viaEnvironmentId`; it has no thread here. */
  | LinkedThreadSurface;

export type ThreadSurface = { id: `thread:${string}`; kind: "thread"; threadId: ThreadId };

const threadSurface = (threadId: ThreadId): ThreadSurface => ({
  id: `thread:${threadId}`,
  kind: "thread",
  threadId,
});

/**
 * A saved thread surface with its id rebuilt, or null when it names no thread. Builds before
 * subagents opened here saved it as `side-chat`.
 */
export function decodeThreadSurface(surface: object): ThreadSurface | null {
  const { kind, threadId } = surface as Record<string, unknown>;
  if ((kind !== "thread" && kind !== "side-chat") || typeof threadId !== "string") return null;
  return threadId === "" ? null : threadSurface(ThreadId.make(threadId));
}

/** One pane per tool: every item of a kind shows in the same pane, one at a time. */
export function paneKindOf(kind: RightPanelKind): PaneKind {
  switch (kind) {
    case "preview":
      return "browser";
    case "file":
    case "files":
      return "files";
    case "pull-requests":
      return "linked";
    case "linked-thread":
    case "thread":
      return "thread";
    default:
      return kind;
  }
}

const RIGHT_PANEL_STORAGE_KEY = "s1code:right-panel-state:v2";
const RIGHT_PANEL_STORAGE_VERSION = 18;

export interface ThreadRightPanelState {
  /** False while every pane is hidden at once; the layout stays as it was. */
  isOpen: boolean;
  /** Null while the chat is alone. */
  layout: LayoutNode | null;
  /** Every pane's items. A pane with items but no leaf is hidden, ready to come back. */
  surfaces: RightPanelSurface[];
  /** The item the user last worked with; its pane is the focused pane. */
  activeSurfaceId: string | null;
  /** The item each pane shows. */
  paneSurfaceIds: Partial<Record<PaneKind, string>>;
  /** A pane filling the whole content area, chat included. */
  fill?: PaneKind;
  /** Where each pane last sat, so showing or reopening it puts it back. */
  placements?: Partial<Record<PaneKind, PanePlacement>>;
  /** Panes floating as small windows over the chat, bottom one first; `placements` keeps their spot. */
  minimized?: PaneKind[];
  /** Panes that hiding every pane floated, so showing the layout again puts them back. */
  floatedOnHide?: PaneKind[];
  /** Browser pages an agent or another client opened that the user has not looked at yet. */
  waitingSurfaceIds?: string[];
  dismissedDeviceSurfaceIds?: string[];
  proactiveDiffTurnId?: RunId;
}

type SingletonKind = "diff" | "files" | "pull-requests" | "device" | "terminal";
type OpenableKind = SingletonKind | "preview";

interface RightPanelStoreState {
  byThreadKey: Record<string, ThreadRightPanelState>;
  userActionRevisionByThreadKey: Record<string, number>;
  closeRevisionByThreadKey: Record<string, number>;
  getUserActionRevision: (ref: ScopedThreadRef) => number;
  markUserAction: (ref: ScopedThreadRef) => number;
  /** Refused if the user chose a panel after expectedUserActionRevision was read. */
  openProactive: (
    ref: ScopedThreadRef,
    request:
      | Extract<RightPanelSurface, { kind: "pull-request" | "pull-requests" }>
      | { kind: "diff"; turnId: RunId },
    expectedUserActionRevision: number,
    activateExisting?: boolean,
  ) => boolean;
  open: (ref: ScopedThreadRef, kind: OpenableKind) => void;
  /** Opens a side chat or subagent of `ref`'s environment; `ref` itself has no pane. */
  openThread: (ref: ScopedThreadRef, threadId: ThreadId) => void;
  openLinkedThread: (ref: ScopedThreadRef, target: LinkedThreadTarget) => void;
  /** Records the title the linked environment gave, so the pane and a reopened one show it. */
  setLinkedThreadTitle: (ref: ScopedThreadRef, surfaceId: string, title: string) => void;
  openDevice: (ref: ScopedThreadRef, target: DeviceTabTarget, automatic?: boolean) => void;
  renameDevice: (ref: ScopedThreadRef, surfaceId: string, title: string) => void;
  openBrowser: (ref: ScopedThreadRef, tabId: string | null) => void;
  openFile: (ref: ScopedThreadRef, relativePath: string, line?: number) => void;
  /** Moves in place; "" opens the root explorer. folderTrail keeps the return path; keepSource keeps the source item. */
  navigateFolder: (
    ref: ScopedThreadRef,
    surfaceId: string,
    relativePath: string,
    folderTrail: string,
    keepSource?: boolean,
  ) => void;
  openAttachment: (ref: ScopedThreadRef, attachment: ChatFileAttachment) => void;
  openPullRequest: (
    ref: ScopedThreadRef,
    target: {
      environmentId?: string;
      projectId: string;
      host?: string;
      repository: string;
      number: number;
      url?: string;
      /** A clicked link to reveal; reopening a surface passes only its `url`. */
      revealUrl?: string;
      detailTab?: PullRequestDetailTab;
    },
  ) => void;
  openIssue: (ref: ScopedThreadRef, target: IssueSurfaceTarget) => void;
  setPullRequestDetailTab: (
    ref: ScopedThreadRef,
    surfaceId: string,
    detailTab: PullRequestDetailTab,
  ) => void;
  /** Clears the surface's pending link only while it is still `revealUrl`. */
  settlePullRequestReveal: (ref: ScopedThreadRef, surfaceId: string, revealUrl: string) => void;
  activateSurface: (ref: ScopedThreadRef, surfaceId: string) => void;
  /** Agent-driven reveal. Not a user action, so it does not move focus. */
  revealSurface: (ref: ScopedThreadRef, surfaceId: string) => void;
  closeSurface: (ref: ScopedThreadRef, surfaceId: string) => void;
  closeAllSurfaces: (ref: ScopedThreadRef) => void;
  /** Shows a pane that has items; false when it has none to show. */
  showPane: (ref: ScopedThreadRef, pane: PaneKind) => boolean;
  /** Takes a pane out of the layout, keeping its items and where it sat. */
  hidePane: (ref: ScopedThreadRef, pane: PaneKind) => void;
  /** Floats a pane as a small window over the chat; showing it puts it back where it sat. */
  minimizePane: (ref: ScopedThreadRef, pane: PaneKind) => void;
  /**
   * Floats `surface` in its pane's small window, adding it when new. An automatic one leaves a
   * pane that is on screen alone and only adds the item, which then waits to be looked at.
   */
  floatSurface: (
    ref: ScopedThreadRef,
    surface: RightPanelSurface,
    automatic?: boolean,
    /** Shows a new item in its pane even when that pane is on screen with another. */
    force?: boolean,
  ) => void;
  /** Stops floating a pane without showing it, as when the device it streams went away. */
  dismissFloatingPane: (ref: ScopedThreadRef, pane: PaneKind) => void;
  /** Hides every pane, floating `float` meanwhile; showing the layout puts those back. */
  hideAll: (ref: ScopedThreadRef, float: readonly PaneKind[]) => void;
  /** Hides a visible pane, or shows it, opening `create` when the pane has nothing yet. */
  togglePane: (ref: ScopedThreadRef, pane: PaneKind, create?: RightPanelSurface) => void;
  movePane: (ref: ScopedThreadRef, pane: PaneKind, target: TileId, side: PaneSide) => void;
  focusPane: (ref: ScopedThreadRef, pane: PaneKind) => void;
  resizeSplit: (ref: ScopedThreadRef, path: readonly number[], sizes: readonly number[]) => void;
  resetDivider: (ref: ScopedThreadRef, path: readonly number[], index: number) => void;
  /** Null restores the layout. A pane not shown yet fills once it opens. */
  setFill: (ref: ScopedThreadRef, pane: PaneKind | null) => void;
  /**
   * Keeps the Browser pane's items in step with the thread's pages. Pages opened elsewhere,
   * revealed or not, wait as items that never take over the pane; the pane leaves the layout
   * when only waiting ones remain.
   */
  reconcileBrowserSurfaces: (ref: ScopedThreadRef, tabIds: readonly string[]) => void;
  reconcileFileSurfaces: (ref: ScopedThreadRef, workspaceAvailable: boolean) => void;
  show: (ref: ScopedThreadRef) => void;
  close: (ref: ScopedThreadRef) => void;
  toggleVisibility: (ref: ScopedThreadRef) => void;
  toggle: (ref: ScopedThreadRef, kind: OpenableKind) => void;
  removeThread: (ref: ScopedThreadRef) => void;
}

const EMPTY_THREAD_STATE: ThreadRightPanelState = {
  isOpen: false,
  layout: null,
  activeSurfaceId: null,
  surfaces: [],
  paneSurfaceIds: {},
};

const singletonSurface = (kind: SingletonKind): RightPanelSurface => {
  switch (kind) {
    case "diff":
      return { id: "diff", kind };
    case "files":
      return { id: "files", kind };
    case "pull-requests":
      return { id: "pull-requests", kind };
    case "device":
      return { id: "device", kind };
    case "terminal":
      return { id: "terminal", kind };
  }
};

export const browserSurface = (tabId: string | null): RightPanelSurface =>
  tabId
    ? { id: `browser:${tabId}`, kind: "preview", resourceId: tabId }
    : { id: "browser:new", kind: "preview", resourceId: null };

export const deviceSurface = (target: DeviceTabTarget): RightPanelSurface => ({
  id: `device:${encodeURIComponent(target.hostId)}:${encodeURIComponent(target.deviceId)}`,
  kind: "device",
  target,
});

const fileSurface = (
  relativePath: string,
  revealLine: number | null,
  revealRequestId: number,
): RightPanelSurface => ({
  id: `file:${relativePath}`,
  kind: "file",
  relativePath,
  revealLine,
  revealRequestId,
});

const attachmentSurface = (attachment: ChatFileAttachment): RightPanelSurface => ({
  id: `attachment:${attachment.id}`,
  kind: "file",
  relativePath: attachment.name,
  revealLine: null,
  revealRequestId: 0,
  attachment,
});

export type PullRequestSurface = Extract<RightPanelSurface, { kind: "pull-request" }>;

export function pullRequestSurfaceId(target: {
  environmentId?: string;
  projectId: string;
  host?: string;
  repository: string;
  number: number;
}): PullRequestSurface["id"] {
  const scope =
    target.environmentId === undefined ? "" : `${encodeURIComponent(target.environmentId)}:`;
  const host = target.host === undefined ? "" : `${encodeURIComponent(target.host.toLowerCase())}:`;
  return `pull-request:${scope}${encodeURIComponent(target.projectId)}:${host}${encodeURIComponent(target.repository)}:${target.number}`;
}

export type IssueSurface = Extract<RightPanelSurface, { kind: "issue" }>;

export interface IssueSurfaceTarget {
  environmentId?: string;
  projectId: string;
  tracker: string;
  host?: string;
  scope: string;
  key: string;
  url?: string;
}

function issueSurfaceId(target: Omit<IssueSurfaceTarget, "url">): IssueSurface["id"] {
  const environment =
    target.environmentId === undefined ? "" : `${encodeURIComponent(target.environmentId)}:`;
  const host = target.host === undefined ? "" : `${encodeURIComponent(target.host.toLowerCase())}:`;
  return `issue:${environment}${encodeURIComponent(target.projectId)}:${target.tracker}:${host}${encodeURIComponent(target.scope.toLowerCase())}:${encodeURIComponent(target.key)}`;
}

function issueSurface(target: IssueSurfaceTarget): IssueSurface {
  return {
    id: issueSurfaceId(target),
    kind: "issue",
    ...(target.environmentId === undefined ? {} : { environmentId: target.environmentId }),
    projectId: target.projectId,
    tracker: target.tracker,
    ...(typeof target.host === "string" ? { host: target.host.toLowerCase() } : {}),
    scope: target.scope,
    key: target.key,
    ...(typeof target.url === "string" ? { url: target.url } : {}),
  };
}

export function pullRequestSurface(target: {
  environmentId?: string;
  projectId: string;
  host?: string;
  repository: string;
  number: number;
  url?: string;
  detailTab?: PullRequestDetailTab;
}): PullRequestSurface {
  return {
    id: pullRequestSurfaceId(target),
    kind: "pull-request",
    ...(target.environmentId === undefined ? {} : { environmentId: target.environmentId }),
    projectId: target.projectId,
    ...(typeof target.host === "string" ? { host: target.host.toLowerCase() } : {}),
    repository: target.repository,
    number: target.number,
    ...(typeof target.url === "string" ? { url: target.url } : {}),
    ...(target.detailTab === undefined ? {} : { detailTab: target.detailTab }),
  };
}

/** A pending link belongs to the click that made it, not to a reload or a reopen. */
const withoutReveal = (surface: RightPanelSurface): RightPanelSurface => {
  if (surface.kind !== "pull-request" || surface.revealUrl === undefined) return surface;
  const { revealUrl: _pending, ...rest } = surface;
  return rest;
};

const paneOf = (surface: RightPanelSurface) => paneKindOf(surface.kind);

const focusedPaneOf = (state: ThreadRightPanelState): PaneKind | null => {
  const active = state.surfaces.find((surface) => surface.id === state.activeSurfaceId);
  return active ? paneOf(active) : null;
};

type PaneListKey = "minimized" | "floatedOnHide";

/** Sets one of the thread's pane lists, leaving the key out while it is empty. */
function withPaneList(
  state: ThreadRightPanelState,
  key: PaneListKey,
  panes: readonly PaneKind[],
): ThreadRightPanelState {
  const current = state[key] ?? [];
  if (current.length === panes.length && current.every((pane, index) => panes[index] === pane)) {
    return state;
  }
  const { [key]: _previous, ...rest } = state;
  return panes.length === 0 ? rest : { ...rest, [key]: [...panes] };
}

const withoutPaneIn = (state: ThreadRightPanelState, key: PaneListKey, pane: PaneKind) =>
  withPaneList(
    state,
    key,
    (state[key] ?? []).filter((entry) => entry !== pane),
  );

/**
 * Puts a pane in the layout, where it last sat or by the default placement, below the pane
 * that was focused before. A user's open leaves another pane's fill so the pane can be seen;
 * an automatic one does not disturb it. A floating pane stops floating.
 */
function placed(
  state: ThreadRightPanelState,
  pane: PaneKind,
  leaveFill: boolean,
  focused: PaneKind | null = focusedPaneOf(state),
): ThreadRightPanelState {
  const layout = placePane(state.layout, pane, {
    focused,
    placement: state.placements?.[pane],
  });
  const fill = !leaveFill || state.fill === pane ? state.fill : undefined;
  const { fill: _fill, ...rest } = state;
  const shown = { ...rest, layout, isOpen: true, ...(fill === undefined ? {} : { fill }) };
  return withoutPaneIn(withoutPaneIn(shown, "minimized", pane), "floatedOnHide", pane);
}

/** Takes a pane out of the layout, remembering where it was. */
function unplaced(state: ThreadRightPanelState, pane: PaneKind): ThreadRightPanelState {
  if (!layoutHasTile(state.layout, pane)) return state;
  const { layout, placement } = removeTile(state.layout, pane);
  const { fill, ...rest } = state;
  return {
    ...rest,
    layout,
    ...(fill === undefined || fill === pane ? {} : { fill }),
    ...(placement ? { placements: { ...state.placements, [pane]: placement } } : {}),
  };
}

/**
 * Shows `surface` in its pane, adding it when new, and makes its pane the focused one. An
 * automatic open (an agent, a finished turn) leaves another pane's fill alone; the DOM focus
 * request that follows a user's open is not made for it either.
 */
const upsertSurface = (
  current: ThreadRightPanelState,
  surface: RightPanelSurface,
  automatic = false,
): ThreadRightPanelState => {
  const pane = paneOf(surface);
  const withItem: ThreadRightPanelState = {
    ...current,
    surfaces: current.surfaces.some((entry) => entry.id === surface.id)
      ? current.surfaces
      : [...current.surfaces, surface],
    paneSurfaceIds: { ...current.paneSurfaceIds, [pane]: surface.id },
    activeSurfaceId: surface.id,
  };
  return placed(withItem, pane, !automatic, focusedPaneOf(current));
};

/** Floats a pane that has something to show, moving focus to a pane still in the layout. */
function minimized(state: ThreadRightPanelState, pane: PaneKind): ThreadRightPanelState {
  if (state.paneSurfaceIds[pane] === undefined || state.minimized?.includes(pane)) return state;
  const removed = withPaneList(unplaced(state, pane), "minimized", [
    ...(state.minimized ?? []),
    pane,
  ]);
  if (focusedPaneOf(state) !== pane) return removed;
  const remaining = visiblePanes(removed).at(-1);
  const next = remaining === undefined ? undefined : removed.paneSurfaceIds[remaining];
  return next === undefined ? removed : { ...removed, activeSurfaceId: next };
}

const sameRecord = (
  left: Partial<Record<string, string>>,
  right: Partial<Record<string, string>>,
) => {
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => left[key] === right[key])
  );
};

/**
 * Keeps a thread's panes consistent with its items: a pane whose last item closed leaves the
 * layout, every pane shows one of its own items, and nothing is open with no pane to show.
 */
function settle(state: ThreadRightPanelState): ThreadRightPanelState {
  let next = state;
  const paneKinds = new Set(state.surfaces.map(paneOf));
  for (const pane of layoutPanes(state.layout)) {
    if (!paneKinds.has(pane)) next = unplaced(next, pane);
  }
  const paneSurfaceIds: Partial<Record<PaneKind, string>> = {};
  for (const pane of paneKinds) {
    const shown = state.paneSurfaceIds[pane];
    paneSurfaceIds[pane] =
      shown !== undefined && state.surfaces.some((surface) => surface.id === shown)
        ? shown
        : state.surfaces.findLast((surface) => paneOf(surface) === pane)!.id;
  }
  if (!sameRecord(paneSurfaceIds, state.paneSurfaceIds)) next = { ...next, paneSurfaceIds };
  const inLayout = new Set(layoutPanes(next.layout));
  for (const key of ["minimized", "floatedOnHide"] as const) {
    const panes = [...new Set(next[key] ?? [])].filter(
      (pane) => paneKinds.has(pane) && !inLayout.has(pane),
    );
    next = withPaneList(next, key, panes);
  }
  if (next.isOpen && inLayout.size === 0) next = { ...next, isOpen: false };
  // The focused pane is one on screen whenever any is, so pane commands never reach past it.
  const onScreen = panesOnScreen(next);
  const focused = focusedPaneOf(next);
  const lostItem = next.activeSurfaceId !== null && focused === null;
  if (lostItem || (onScreen.length > 0 && (focused === null || !onScreen.includes(focused)))) {
    const target = onScreen.at(-1) ?? layoutPanes(next.layout).at(-1);
    next = {
      ...next,
      activeSurfaceId: target === undefined ? null : (paneSurfaceIds[target] ?? null),
    };
  }
  const waiting = next.waitingSurfaceIds?.filter(
    (id) =>
      next.surfaces.some((surface) => surface.id === id) &&
      !onScreen.some((pane) => paneSurfaceIds[pane] === id),
  );
  if (waiting !== undefined && waiting.length !== next.waitingSurfaceIds!.length) {
    const { waitingSurfaceIds: _waiting, ...rest } = next;
    next = waiting.length === 0 ? rest : { ...rest, waitingSurfaceIds: waiting };
  }
  return next;
}

const updateThreadStateMap = (
  byThreadKey: Record<string, ThreadRightPanelState>,
  threadKey: string,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
): Record<string, ThreadRightPanelState> => {
  const current = byThreadKey[threadKey] ?? EMPTY_THREAD_STATE;
  const updated = updater(current);
  if (updated === current) return byThreadKey;
  const next = settle(updated);
  if (
    next.surfaces.length === 0 &&
    next.layout === null &&
    next.placements === undefined &&
    next.minimized === undefined &&
    next.fill === undefined &&
    !next.dismissedDeviceSurfaceIds?.length &&
    next.proactiveDiffTurnId === undefined
  ) {
    if (!(threadKey in byThreadKey)) return byThreadKey;
    const { [threadKey]: _removed, ...rest } = byThreadKey;
    return rest;
  }
  return { ...byThreadKey, [threadKey]: next };
};

type RightPanelStoreData = Pick<RightPanelStoreState, "byThreadKey">;

const updateThread = (
  state: RightPanelStoreData,
  threadKey: string,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
): RightPanelStoreData => {
  return { byThreadKey: updateThreadStateMap(state.byThreadKey, threadKey, updater) };
};

const automaticUpdate = (
  state: RightPanelStoreState,
  threadKey: string,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
): Partial<RightPanelStoreState> => ({
  ...updateThread(state, threadKey, updater),
});

// A side chat pane has no panel of its own, so its panel actions open in its parent's panel.
const panelHosts = new Map<string, ScopedThreadRef>();

/** Routes `guest`'s panel actions to `host`'s panel until the returned cleanup runs. */
export function hostRightPanel(guest: ScopedThreadRef, host: ScopedThreadRef): () => void {
  const guestKey = scopedThreadKey(guest);
  panelHosts.set(guestKey, host);
  return () => {
    if (panelHosts.get(guestKey) === host) panelHosts.delete(guestKey);
  };
}

/** The thread whose panel shows `ref`'s panel actions, so it also owns their browser tabs. */
export function rightPanelHostRef(ref: ScopedThreadRef): ScopedThreadRef {
  return panelHosts.get(scopedThreadKey(ref)) ?? ref;
}

const userAction = (
  state: RightPanelStoreState,
  guestKey: string,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
  closesView = false,
): Partial<RightPanelStoreState> => {
  const host = panelHosts.get(guestKey);
  const threadKey = host === undefined ? guestKey : scopedThreadKey(host);
  return userActionOnThread(state, threadKey, updater, closesView);
};

const userActionOnThread = (
  state: RightPanelStoreState,
  threadKey: string,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
  closesView: boolean,
): Partial<RightPanelStoreState> => ({
  ...updateThread(state, threadKey, (current) => {
    const next = updater(current);
    if (next === current) return current;
    const removedDevices = current.surfaces.filter(
      (surface) =>
        surface.kind === "device" && !next.surfaces.some((entry) => entry.id === surface.id),
    );
    if (removedDevices.length === 0) return next;
    return {
      ...next,
      dismissedDeviceSurfaceIds: [
        ...new Set([
          ...(next.dismissedDeviceSurfaceIds ?? []),
          ...removedDevices.map((surface) => surface.id),
        ]),
      ],
    };
  }),
  userActionRevisionByThreadKey: {
    ...state.userActionRevisionByThreadKey,
    [threadKey]: (state.userActionRevisionByThreadKey[threadKey] ?? 0) + 1,
  },
  ...(closesView
    ? {
        closeRevisionByThreadKey: {
          ...state.closeRevisionByThreadKey,
          [threadKey]: (state.closeRevisionByThreadKey[threadKey] ?? 0) + 1,
        },
      }
    : {}),
});

const shownIn = (current: ThreadRightPanelState, surfaceId: string, automatic = false) => {
  const surface = current.surfaces.find((entry) => entry.id === surfaceId);
  return surface ? upsertSurface(current, surface, automatic) : current;
};

/** Hides a visible pane, else shows what it has, else opens `create` in it. */
const toggled = (
  current: ThreadRightPanelState,
  pane: PaneKind,
  create: RightPanelSurface | undefined,
): ThreadRightPanelState => {
  if (isPaneVisible(current, pane)) return unplaced(current, pane);
  const shown = current.paneSurfaceIds[pane];
  if (shown !== undefined) return shownIn(current, shown);
  return create ? upsertSurface(current, create) : current;
};

const closeAction = (
  state: RightPanelStoreState,
  threadKey: string,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
): Partial<RightPanelStoreState> => userAction(state, threadKey, updater, true);

/** Removes items; a pane left without any leaves the layout when the state settles. */
const withoutSurfaces = (
  current: ThreadRightPanelState,
  keep: (surface: RightPanelSurface) => boolean,
): ThreadRightPanelState => {
  const surfaces = current.surfaces.filter(keep);
  return surfaces.length === current.surfaces.length ? current : { ...current, surfaces };
};

function normalizeRevealLine(line: number | undefined): number | null {
  if (line === undefined || !Number.isFinite(line)) return null;
  return Math.max(1, Math.trunc(line));
}

/** A surface saved by any earlier build, rebuilt, or null when this build cannot use it. */
function decodeSurface(raw: unknown): RightPanelSurface | null {
  if (!raw || typeof raw !== "object") return null;
  let surface = raw as RightPanelSurface;
  const kind = (raw as { kind?: string }).kind;
  if (kind === "thread" || kind === "side-chat") return decodeThreadSurface(raw);
  // Also drops kinds this build does not know, such as one a newer build saved.
  if (!(RIGHT_PANEL_KINDS as ReadonlyArray<unknown>).includes(kind)) return null;
  if (surface.kind === "linked-thread") return decodeLinkedThreadSurface(surface);
  if (surface.kind === "terminal") return singletonSurface("terminal");
  if (
    (surface.kind === "file" || surface.kind === "files") &&
    "folderTrail" in surface &&
    typeof surface.folderTrail !== "string"
  ) {
    const { folderTrail: _invalid, ...rest } = surface;
    surface = rest;
  }
  if (surface.kind === "file") {
    const revealLine =
      typeof surface.revealLine === "number" && Number.isFinite(surface.revealLine)
        ? Math.max(1, Math.trunc(surface.revealLine))
        : null;
    const revealRequestId =
      typeof surface.revealRequestId === "number" &&
      Number.isSafeInteger(surface.revealRequestId) &&
      surface.revealRequestId >= 0
        ? surface.revealRequestId
        : 0;
    return { ...surface, revealLine, revealRequestId };
  }
  if (surface.kind === "pull-request") {
    if (
      typeof surface.projectId !== "string" ||
      typeof surface.repository !== "string" ||
      typeof surface.number !== "number" ||
      !Number.isSafeInteger(surface.number) ||
      surface.number < 1
    ) {
      return null;
    }
    const { environmentId, ...rest } = surface;
    return pullRequestSurface({
      ...rest,
      ...(typeof environmentId === "string" ? { environmentId } : {}),
    });
  }
  if (surface.kind === "issue") {
    if (
      typeof surface.projectId !== "string" ||
      typeof surface.tracker !== "string" ||
      typeof surface.scope !== "string" ||
      typeof surface.key !== "string"
    ) {
      return null;
    }
    const { environmentId, ...rest } = surface;
    return issueSurface({
      ...rest,
      ...(typeof environmentId === "string" ? { environmentId } : {}),
    });
  }
  return surface;
}

/** A terminal tab's own shells, which builds before version 18 kept apart from the drawer's. */
export interface MigratedTerminalGroup {
  readonly terminalIds: string[];
  readonly activeTerminalId: string;
  readonly splitDirection?: "horizontal" | "vertical";
}

function migratedTerminalGroup(raw: unknown): MigratedTerminalGroup | null {
  const saved = raw as Record<string, unknown>;
  const ids = Array.isArray(saved.terminalIds)
    ? saved.terminalIds.filter((id): id is string => typeof id === "string" && id.trim() !== "")
    : [];
  const terminalIds =
    ids.length > 0 ? ids : typeof saved.resourceId === "string" ? [saved.resourceId] : [];
  if (terminalIds.length === 0) return null;
  const activeTerminalId =
    typeof saved.activeTerminalId === "string" && terminalIds.includes(saved.activeTerminalId)
      ? saved.activeTerminalId
      : terminalIds[0]!;
  return {
    terminalIds,
    activeTerminalId,
    ...(saved.splitDirection === "vertical" ? { splitDirection: "vertical" as const } : {}),
  };
}

/**
 * Builds before version 18 kept a row of tabs. The tab that was showing becomes the one pane,
 * beside the chat; the rest are dropped, since a row of tabs has no layout to restore them to.
 * A terminal tab's shells move to the terminal store, which the drawer state never listed.
 */
function migrateTabbedThread(saved: Record<string, unknown>): {
  state: ThreadRightPanelState | null;
  terminal: MigratedTerminalGroup | null;
} {
  const savedActiveId =
    typeof saved.activeSurfaceId === "string" && saved.activeSurfaceId.startsWith("side-chat:")
      ? `thread:${saved.activeSurfaceId.slice("side-chat:".length)}`
      : saved.activeSurfaceId;
  const decoded = (Array.isArray(saved.surfaces) ? saved.surfaces : []).flatMap((raw) => {
    const surface = decodeSurface(raw);
    return surface === null ? [] : [{ raw, rawId: (raw as { id?: unknown }).id, surface }];
  });
  const savedActiveEntry = decoded.find(
    ({ rawId, surface }) => surface.id === savedActiveId || rawId === savedActiveId,
  );
  const savedActive =
    savedActiveEntry?.surface ??
    (savedActiveId === "pull-request"
      ? decoded.find(({ surface }) => surface.kind === "pull-request")?.surface
      : undefined) ??
    null;
  const isOpen =
    decoded.length > 0 && (typeof saved.isOpen === "boolean" ? saved.isOpen : savedActive !== null);
  const activeEntry =
    savedActive !== null
      ? (decoded.find((entry) => entry.surface === savedActive) ?? savedActiveEntry)
      : isOpen || savedActiveId === "agents"
        ? decoded[0]
        : undefined;
  const active = savedActive ?? activeEntry?.surface ?? null;
  const terminal =
    active?.kind === "terminal" && activeEntry ? migratedTerminalGroup(activeEntry.raw) : null;
  const extras = {
    ...(typeof saved.proactiveDiffTurnId === "string"
      ? { proactiveDiffTurnId: RunId.make(saved.proactiveDiffTurnId) }
      : {}),
    ...(Array.isArray(saved.dismissedDeviceSurfaceIds)
      ? {
          dismissedDeviceSurfaceIds: saved.dismissedDeviceSurfaceIds.filter(
            (id): id is string => typeof id === "string",
          ),
        }
      : {}),
  };
  if (active === null) {
    return {
      state: Object.keys(extras).length === 0 ? null : { ...EMPTY_THREAD_STATE, ...extras },
      terminal: null,
    };
  }
  const pane = paneOf(active);
  return {
    state: {
      isOpen,
      layout: placePane(null, pane, { focused: null, placement: undefined }),
      surfaces: [active],
      activeSurfaceId: active.id,
      paneSurfaceIds: { [pane]: active.id },
      ...(saved.maximized === true ? { fill: pane } : {}),
      ...extras,
    },
    terminal,
  };
}

export function migratePersistedRightPanelState(persistedState: unknown): {
  byThreadKey: Record<string, ThreadRightPanelState>;
  terminalGroups: Record<string, MigratedTerminalGroup>;
} {
  const terminalGroups: Record<string, MigratedTerminalGroup> = {};
  if (!persistedState || typeof persistedState !== "object") {
    return { byThreadKey: {}, terminalGroups };
  }
  const saved =
    "byThreadKey" in persistedState &&
    persistedState.byThreadKey &&
    typeof persistedState.byThreadKey === "object"
      ? (persistedState.byThreadKey as Record<string, unknown>)
      : {};
  const byThreadKey: Record<string, ThreadRightPanelState> = {};
  for (const [threadKey, threadState] of Object.entries(saved)) {
    // The old Pull requests and Issues pages kept their own panels under fixed keys.
    if (threadKey.endsWith(":pull-requests-panel") || threadKey.endsWith(":issues-panel")) continue;
    if (!threadState || typeof threadState !== "object") continue;
    const migrated = migrateTabbedThread(threadState as Record<string, unknown>);
    if (migrated.state !== null) byThreadKey[threadKey] = migrated.state;
    if (migrated.terminal !== null) terminalGroups[threadKey] = migrated.terminal;
  }
  return { byThreadKey, terminalGroups };
}

/** Rebuilds a version 18 thread, dropping what does not fit together any more. */
function decodeThreadState(raw: unknown): ThreadRightPanelState | null {
  if (!raw || typeof raw !== "object") return null;
  const saved = raw as Record<string, unknown>;
  const surfaces = Array.isArray(saved.surfaces)
    ? saved.surfaces.flatMap((surface) => {
        const decoded = decodeSurface(surface);
        return decoded === null ? [] : [decoded];
      })
    : [];
  const paneSurfaceIds: Partial<Record<PaneKind, string>> = {};
  if (saved.paneSurfaceIds && typeof saved.paneSurfaceIds === "object") {
    for (const [pane, id] of Object.entries(saved.paneSurfaceIds)) {
      if (isPaneKind(pane) && typeof id === "string") paneSurfaceIds[pane] = id;
    }
  }
  const placements: Partial<Record<PaneKind, PanePlacement>> = {};
  if (saved.placements && typeof saved.placements === "object") {
    for (const [pane, value] of Object.entries(saved.placements)) {
      const placement = value as Partial<PanePlacement> | null;
      if (
        isPaneKind(pane) &&
        placement &&
        (placement.neighbor === "chat" || isPaneKind(placement.neighbor)) &&
        (placement.side === "left" ||
          placement.side === "right" ||
          placement.side === "top" ||
          placement.side === "bottom") &&
        typeof placement.ratio === "number" &&
        placement.ratio > 0 &&
        placement.ratio < 1
      ) {
        const group = Array.isArray(placement.group)
          ? placement.group.filter((tile): tile is TileId => tile === "chat" || isPaneKind(tile))
          : [];
        placements[pane] = {
          neighbor: placement.neighbor,
          side: placement.side,
          ratio: placement.ratio,
          ...(group.length > 1 ? { group } : {}),
        };
      }
    }
  }
  const paneList = (value: unknown): PaneKind[] =>
    Array.isArray(value) ? value.filter((pane): pane is PaneKind => isPaneKind(pane)) : [];
  const minimizedPanes = paneList(saved.minimized);
  const floatedOnHide = paneList(saved.floatedOnHide);
  const waitingSurfaceIds = Array.isArray(saved.waitingSurfaceIds)
    ? saved.waitingSurfaceIds.filter((id): id is string => typeof id === "string")
    : [];
  const state: ThreadRightPanelState = {
    isOpen: saved.isOpen === true,
    layout: decodeLayout(saved.layout),
    surfaces,
    activeSurfaceId: typeof saved.activeSurfaceId === "string" ? saved.activeSurfaceId : null,
    paneSurfaceIds,
    ...(isPaneKind(saved.fill) ? { fill: saved.fill } : {}),
    ...(Object.keys(placements).length > 0 ? { placements } : {}),
    ...(minimizedPanes.length > 0 ? { minimized: minimizedPanes } : {}),
    ...(floatedOnHide.length > 0 ? { floatedOnHide } : {}),
    ...(waitingSurfaceIds.length > 0 ? { waitingSurfaceIds } : {}),
    ...(typeof saved.proactiveDiffTurnId === "string"
      ? { proactiveDiffTurnId: RunId.make(saved.proactiveDiffTurnId) }
      : {}),
    ...(Array.isArray(saved.dismissedDeviceSurfaceIds)
      ? {
          dismissedDeviceSurfaceIds: saved.dismissedDeviceSurfaceIds.filter(
            (id): id is string => typeof id === "string",
          ),
        }
      : {}),
  };
  return settle(state);
}

export const useRightPanelStore = create<RightPanelStoreState>()(
  persist(
    (set, get) => ({
      byThreadKey: {},
      userActionRevisionByThreadKey: {},
      closeRevisionByThreadKey: {},
      getUserActionRevision: (ref) =>
        get().userActionRevisionByThreadKey[scopedThreadKey(ref)] ?? 0,
      markUserAction: (ref) => {
        const revision = get().getUserActionRevision(ref) + 1;
        set((state) => ({
          userActionRevisionByThreadKey: {
            ...state.userActionRevisionByThreadKey,
            [scopedThreadKey(ref)]: revision,
          },
        }));
        return revision;
      },
      openProactive: (ref, request, expectedUserActionRevision, activateExisting = false) => {
        let opened = false;
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          if (request.kind === "diff") {
            const current = selectThreadRightPanelState(state.byThreadKey, ref);
            if (current.proactiveDiffTurnId === request.turnId) return state;
            const focusedKind = selectActiveRightPanelSurface(state.byThreadKey, ref)?.kind;
            opened =
              (state.userActionRevisionByThreadKey[threadKey] ?? 0) ===
                expectedUserActionRevision &&
              focusedKind !== "diff" &&
              focusedKind !== "pull-request" &&
              focusedKind !== "pull-requests";
            // Record the offer even when refused, so a revisit does not retry this turn.
            return automaticUpdate(state, threadKey, (thread) => ({
              ...(opened ? upsertSurface(thread, singletonSurface("diff"), true) : thread),
              proactiveDiffTurnId: request.turnId,
            }));
          }
          if (
            (state.userActionRevisionByThreadKey[threadKey] ?? 0) !== expectedUserActionRevision
          ) {
            return state;
          }
          // Keep an existing PR item where the user left it when revisiting a thread.
          if (
            !activateExisting &&
            selectThreadRightPanelState(state.byThreadKey, ref).surfaces.some(
              (entry) => entry.id === request.id,
            )
          ) {
            return state;
          }
          opened = true;
          return automaticUpdate(state, threadKey, (current) =>
            upsertSurface(current, request, true),
          );
        });
        return opened;
      },
      open: (ref, kind) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            if (kind === "preview") {
              const pane = current.paneSurfaceIds.browser;
              const existing = current.surfaces.find((surface) => surface.id === pane);
              return upsertSurface(current, existing ?? browserSurface(null));
            }
            return upsertSurface(current, singletonSurface(kind));
          }),
        ),
      openDevice: (ref, target, automatic = false) =>
        set((state) =>
          (automatic ? automaticUpdate : userAction)(state, scopedThreadKey(ref), (current) => {
            const surface = deviceSurface(target);
            const id = surface.id;
            if (automatic && current.dismissedDeviceSurfaceIds?.includes(id)) return current;
            const existing = current.surfaces.find((entry) => entry.id === id);
            const surfaces = existing
              ? current.surfaces.filter((entry) => entry.id !== "device")
              : current.surfaces.map((entry) => (entry.id === "device" ? surface : entry));
            return upsertSurface(
              {
                ...current,
                surfaces,
                dismissedDeviceSurfaceIds: (current.dismissedDeviceSurfaceIds ?? []).filter(
                  (entry) => entry !== id,
                ),
              },
              existing ?? surface,
              automatic,
            );
          }),
        ),
      openThread: (ref, threadId) =>
        set((state) =>
          rightPanelHostRef(ref).threadId === threadId
            ? state
            : userAction(state, scopedThreadKey(ref), (current) =>
                upsertSurface(current, threadSurface(threadId)),
              ),
        ),
      openLinkedThread: (ref, target) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            const surface = linkedThreadSurface(target);
            const next = upsertSurface(current, surface);
            return {
              ...next,
              // A later click may know the title or label an earlier one did not.
              surfaces: next.surfaces.map((entry) =>
                entry.id === surface.id && entry.kind === "linked-thread"
                  ? { ...surface, title: surface.title ?? entry.title }
                  : entry,
              ),
            };
          }),
        ),
      setLinkedThreadTitle: (ref, surfaceId, title) =>
        set((state) => {
          const threadKey = scopedThreadKey(rightPanelHostRef(ref));
          const existing = state.byThreadKey[threadKey]?.surfaces.find(
            (surface) => surface.id === surfaceId,
          );
          if (existing?.kind !== "linked-thread" || existing.title === title) return state;
          return automaticUpdate(state, threadKey, (current) => ({
            ...current,
            surfaces: current.surfaces.map((surface) =>
              surface.id === surfaceId && surface.kind === "linked-thread"
                ? { ...surface, title }
                : surface,
            ),
          }));
        }),
      renameDevice: (ref, surfaceId, title) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => ({
            ...current,
            surfaces: current.surfaces.map((surface) =>
              surface.id === surfaceId && surface.kind === "device"
                ? {
                    ...surface,
                    title:
                      title.trim() ||
                      surface.target?.name ||
                      m(msg("Device", { $context: "a simulator or emulator" })),
                  }
                : surface,
            ),
          })),
        ),
      openBrowser: (ref, tabId) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            const surface = browserSurface(tabId);
            const withoutPlaceholder = tabId
              ? current.surfaces.filter((entry) => entry.id !== "browser:new")
              : current.surfaces;
            return upsertSurface({ ...current, surfaces: withoutPlaceholder }, surface);
          }),
        ),
      openPullRequest: (ref, target) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            const surface = pullRequestSurface(target);
            const next = upsertSurface(current, surface);
            const { url, revealUrl } = target;
            if (!url && !revealUrl) return next;
            return {
              ...next,
              surfaces: next.surfaces.map((entry) => {
                if (entry.id !== surface.id || entry.kind !== "pull-request") return entry;
                // A later link replaces one not yet shown.
                const { revealUrl: _previous, ...rest } = entry;
                return { ...rest, ...surface, ...(revealUrl ? { revealUrl } : {}) };
              }),
            };
          }),
        ),
      openIssue: (ref, target) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            const surface = issueSurface(target);
            const next = upsertSurface(current, surface);
            return target.url
              ? {
                  ...next,
                  surfaces: next.surfaces.map((entry) =>
                    entry.id === surface.id ? surface : entry,
                  ),
                }
              : next;
          }),
        ),
      setPullRequestDetailTab: (ref, surfaceId, detailTab) =>
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          const existing = state.byThreadKey[threadKey]?.surfaces.find(
            (surface) => surface.id === surfaceId,
          );
          if (existing?.kind !== "pull-request" || (existing.detailTab ?? "summary") === detailTab)
            return state;
          return automaticUpdate(state, threadKey, (current) => ({
            ...current,
            surfaces: current.surfaces.map((surface) =>
              surface.id === surfaceId && surface.kind === "pull-request"
                ? { ...surface, detailTab }
                : surface,
            ),
          }));
        }),
      settlePullRequestReveal: (ref, surfaceId, revealUrl) =>
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          const existing = state.byThreadKey[threadKey]?.surfaces.find(
            (surface) => surface.id === surfaceId,
          );
          if (existing?.kind !== "pull-request" || existing.revealUrl !== revealUrl) return state;
          return automaticUpdate(state, threadKey, (current) => ({
            ...current,
            surfaces: current.surfaces.map((surface) =>
              surface.id === surfaceId ? withoutReveal(surface) : surface,
            ),
          }));
        }),
      openFile: (ref, requestedPath, line) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            if (requestedPath === ".") {
              return upsertSurface(current, singletonSurface("files"));
            }
            // Workspace entry paths use '/', including on Windows.
            const relativePath = /^[A-Za-z]:\/+$/.test(requestedPath)
              ? requestedPath
              : requestedPath.replace(/\/+$/, "") || requestedPath;
            const withoutStandaloneExplorer = current.surfaces.filter(
              (surface) => surface.kind !== "files",
            );
            const surfaceId = `file:${relativePath}` as const;
            const existing = withoutStandaloneExplorer.find(
              (surface): surface is Extract<RightPanelSurface, { kind: "file" }> =>
                surface.id === surfaceId && surface.kind === "file",
            );
            const surface = fileSurface(
              relativePath,
              normalizeRevealLine(line),
              (existing?.revealRequestId ?? 0) + 1,
            );
            return upsertSurface(
              {
                ...current,
                surfaces: existing
                  ? withoutStandaloneExplorer.map((entry) =>
                      entry.id === surface.id ? surface : entry,
                    )
                  : withoutStandaloneExplorer,
              },
              surface,
            );
          }),
        ),
      navigateFolder: (ref, surfaceId, relativePath, folderTrail, keepSource = false) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            const index = current.surfaces.findIndex((surface) => surface.id === surfaceId);
            if (index < 0) return current;
            const trail = folderTrail === relativePath ? {} : { folderTrail };
            const target: RightPanelSurface =
              relativePath === ""
                ? { ...singletonSurface("files"), ...trail }
                : { ...fileSurface(relativePath, null, 1), ...trail };
            const source = current.surfaces[index]!;
            const existing = current.surfaces.some(
              (surface, i) => i !== index && surface.id === target.id,
            );
            const surfaces = current.surfaces.flatMap((surface, i) => {
              if (i === index) {
                const kept = keepSource ? [source] : [];
                return existing ? kept : [...kept, target];
              }
              return !existing && target.kind === "file" && surface.kind === "files"
                ? []
                : [surface];
            });
            return upsertSurface({ ...current, surfaces }, target);
          }),
        ),
      openAttachment: (ref, attachment) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            const withoutStandaloneExplorer = current.surfaces.filter(
              (surface) => surface.kind !== "files",
            );
            return upsertSurface(
              { ...current, surfaces: withoutStandaloneExplorer },
              attachmentSurface(attachment),
            );
          }),
        ),
      activateSurface: (ref, surfaceId) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => shownIn(current, surfaceId)),
        ),
      revealSurface: (ref, surfaceId) =>
        set((state) =>
          automaticUpdate(state, scopedThreadKey(ref), (current) =>
            shownIn(current, surfaceId, true),
          ),
        ),
      closeSurface: (ref, surfaceId) =>
        set((state) =>
          closeAction(state, scopedThreadKey(ref), (current) =>
            withoutSurfaces(current, (surface) => surface.id !== surfaceId),
          ),
        ),
      closeAllSurfaces: (ref) =>
        set((state) =>
          closeAction(state, scopedThreadKey(ref), (current) =>
            current.surfaces.length === 0 ? current : withoutSurfaces(current, () => false),
          ),
        ),
      showPane: (ref, pane) => {
        const shown = selectThreadRightPanelState(get().byThreadKey, rightPanelHostRef(ref))
          .paneSurfaceIds[pane];
        if (shown === undefined) return false;
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => shownIn(current, shown)),
        );
        return true;
      },
      hidePane: (ref, pane) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => unplaced(current, pane)),
        ),
      minimizePane: (ref, pane) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => minimized(current, pane)),
        ),
      floatSurface: (ref, surface, automatic = false, force = false) =>
        set((state) =>
          (automatic ? automaticUpdate : userAction)(state, scopedThreadKey(ref), (current) => {
            const pane = paneOf(surface);
            const known = current.surfaces.some((entry) => entry.id === surface.id);
            const withItem: ThreadRightPanelState = known
              ? current
              : { ...current, surfaces: [...current.surfaces, surface] };
            if (force && isPaneVisible(current, pane))
              return upsertSurface(withItem, surface, true);
            if (automatic && !force && panesOnScreen(current).includes(pane)) {
              if (known || current.paneSurfaceIds[pane] === surface.id) return withItem;
              return {
                ...withItem,
                waitingSurfaceIds: [...(current.waitingSurfaceIds ?? []), surface.id],
              };
            }
            const shown = {
              ...withItem,
              paneSurfaceIds: { ...withItem.paneSurfaceIds, [pane]: surface.id },
            };
            return current.minimized?.includes(pane)
              ? shown
              : minimized(
                  { ...shown, ...(automatic ? {} : { activeSurfaceId: surface.id }) },
                  pane,
                );
          }),
        ),
      dismissFloatingPane: (ref, pane) =>
        set((state) =>
          automaticUpdate(state, scopedThreadKey(ref), (current) =>
            withoutPaneIn(current, "minimized", pane),
          ),
        ),
      hideAll: (ref, float) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            let next: ThreadRightPanelState = current;
            for (const pane of float) {
              if (isPaneVisible(next, pane)) next = minimized(next, pane);
            }
            const floated = float.filter((pane) => next.minimized?.includes(pane));
            // Floating the filled pane drops its fill; showing the layout again brings it back.
            const { fill: _fill, ...rest } = withPaneList(next, "floatedOnHide", floated);
            return {
              ...rest,
              isOpen: false,
              ...(current.fill === undefined ? {} : { fill: current.fill }),
            };
          }),
        ),
      togglePane: (ref, pane, create) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => toggled(current, pane, create)),
        ),
      movePane: (ref, pane, target, side) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            const layout = moveLayoutPane(current.layout, pane, target, side);
            if (layout === current.layout) return current;
            const shown = current.paneSurfaceIds[pane];
            return {
              ...current,
              layout,
              ...(shown === undefined ? {} : { activeSurfaceId: shown }),
            };
          }),
        ),
      focusPane: (ref, pane) =>
        set((state) =>
          updateThread(state, scopedThreadKey(rightPanelHostRef(ref)), (current) => {
            const shown = current.paneSurfaceIds[pane];
            return shown === undefined || shown === current.activeSurfaceId
              ? current
              : { ...current, activeSurfaceId: shown };
          }),
        ),
      resizeSplit: (ref, path, sizes) =>
        set((state) =>
          updateThread(state, scopedThreadKey(ref), (current) => {
            const layout = setSplitSizes(current.layout, path, sizes);
            return layout === current.layout ? current : { ...current, layout };
          }),
        ),
      resetDivider: (ref, path, index) =>
        set((state) =>
          updateThread(state, scopedThreadKey(ref), (current) => {
            const layout = resetDividerSizes(current.layout, path, index);
            return layout === current.layout ? current : { ...current, layout };
          }),
        ),
      setFill: (ref, pane) =>
        set((state) =>
          automaticUpdate(state, scopedThreadKey(rightPanelHostRef(ref)), (current) => {
            if ((current.fill ?? null) === pane) return current;
            const { fill: _fill, ...rest } = current;
            return pane === null ? rest : { ...rest, fill: pane, isOpen: true };
          }),
        ),
      reconcileBrowserSurfaces: (ref, tabIds) =>
        set((state) =>
          automaticUpdate(state, scopedThreadKey(ref), (current) => {
            const validIds = new Set(tabIds.map((tabId) => `browser:${tabId}`));
            const kept = current.surfaces.filter(
              (surface) =>
                surface.kind !== "preview" ||
                (surface.id !== "browser:new" && validIds.has(surface.id)),
            );
            const knownIds = new Set(kept.map((surface) => surface.id));
            const added = tabIds
              .filter((tabId) => !knownIds.has(`browser:${tabId}`))
              .map((tabId) => browserSurface(tabId));
            if (added.length === 0 && kept.length === current.surfaces.length) return current;
            const waiting = [
              ...(current.waitingSurfaceIds ?? []),
              ...added.map((surface) => surface.id),
            ];
            const next: ThreadRightPanelState = {
              ...current,
              surfaces: [...kept, ...added],
              ...(waiting.length === 0 ? {} : { waitingSurfaceIds: waiting }),
            };
            const shown = current.paneSurfaceIds.browser;
            if (shown === undefined || validIds.has(shown)) return next;
            const fallback = kept.findLast(
              (surface) => surface.kind === "preview" && !waiting.includes(surface.id),
            );
            if (fallback) {
              return { ...next, paneSurfaceIds: { ...next.paneSurfaceIds, browser: fallback.id } };
            }
            return withoutPaneIn(unplaced(next, "browser"), "minimized", "browser");
          }),
        ),
      reconcileFileSurfaces: (ref, workspaceAvailable) =>
        set((state) =>
          automaticUpdate(state, scopedThreadKey(ref), (current) =>
            workspaceAvailable
              ? current
              : withoutSurfaces(
                  current,
                  (surface) =>
                    surface.kind !== "files" &&
                    (surface.kind !== "file" || surface.attachment !== undefined),
                ),
          ),
        ),
      show: (ref) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => {
            let next: ThreadRightPanelState = current.isOpen
              ? current
              : { ...current, isOpen: true };
            // Each placement was recorded against the layout left by the ones before it.
            for (const pane of (current.floatedOnHide ?? []).toReversed()) {
              next = placed(next, pane, false);
            }
            return next;
          }),
        ),
      close: (ref) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) =>
            current.isOpen ? { ...current, isOpen: false } : current,
          ),
        ),
      toggleVisibility: (ref) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) => ({
            ...current,
            isOpen: !current.isOpen,
          })),
        ),
      toggle: (ref, kind) =>
        set((state) =>
          userAction(state, scopedThreadKey(ref), (current) =>
            toggled(
              current,
              paneKindOf(kind),
              kind === "preview" ? browserSurface(null) : singletonSurface(kind),
            ),
          ),
        ),
      removeThread: (ref) =>
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          if (
            !(threadKey in state.byThreadKey) &&
            !(threadKey in state.userActionRevisionByThreadKey) &&
            !(threadKey in state.closeRevisionByThreadKey)
          ) {
            return state;
          }
          const { [threadKey]: _removed, ...byThreadKey } = state.byThreadKey;
          const { [threadKey]: _revision, ...userActionRevisionByThreadKey } =
            state.userActionRevisionByThreadKey;
          const { [threadKey]: _closeRevision, ...closeRevisionByThreadKey } =
            state.closeRevisionByThreadKey;
          return {
            byThreadKey,
            userActionRevisionByThreadKey,
            closeRevisionByThreadKey,
          };
        }),
    }),
    {
      name: RIGHT_PANEL_STORAGE_KEY,
      version: RIGHT_PANEL_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        byThreadKey: Object.fromEntries(
          Object.entries(state.byThreadKey).map(([threadKey, threadState]) => [
            threadKey,
            { ...threadState, surfaces: threadState.surfaces.map(withoutReveal) },
          ]),
        ),
      }),
      migrate: (persistedState) => {
        const { byThreadKey, terminalGroups } = migratePersistedRightPanelState(persistedState);
        for (const [threadKey, group] of Object.entries(terminalGroups)) {
          const threadRef = parseScopedThreadKey(threadKey);
          if (threadRef) useTerminalUiStateStore.getState().importTerminalGroup(threadRef, group);
        }
        return { byThreadKey };
      },
      merge: (persisted, current) => {
        const saved =
          persisted && typeof persisted === "object" && "byThreadKey" in persisted
            ? (persisted.byThreadKey as Record<string, unknown>)
            : {};
        const byThreadKey: Record<string, ThreadRightPanelState> = {};
        for (const [threadKey, threadState] of Object.entries(saved ?? {})) {
          const decoded = decodeThreadState(threadState);
          if (decoded !== null) byThreadKey[threadKey] = decoded;
        }
        return { ...current, byThreadKey };
      },
    },
  ),
);

useRightPanelStore.subscribe((next, previous) => {
  if (next.closeRevisionByThreadKey === previous.closeRevisionByThreadKey) return;
  for (const [threadKey, revision] of Object.entries(next.closeRevisionByThreadKey)) {
    if (revision === previous.closeRevisionByThreadKey[threadKey]) continue;
    const threadRef = parseScopedThreadKey(threadKey);
    if (!threadRef) continue;
    const before = previous.byThreadKey[threadKey] ?? EMPTY_THREAD_STATE;
    const after = next.byThreadKey[threadKey] ?? EMPTY_THREAD_STATE;
    const removed = before.surfaces.filter(
      (surface) => !after.surfaces.some((entry) => entry.id === surface.id),
    );
    const closedInOrder = [
      ...removed.filter((surface) => surface.id !== before.activeSurfaceId),
      ...removed.filter((surface) => surface.id === before.activeSurfaceId),
    ];
    for (const surface of closedInOrder.map(withoutReveal)) {
      if (
        surface.kind === "terminal" ||
        (surface.kind === "preview" && surface.resourceId !== null)
      )
        continue;
      useClosedViewStore.getState().remember({ kind: "panel-tab", threadRef, surface });
    }
  }
});

export function selectThreadRightPanelState(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
): ThreadRightPanelState {
  if (!ref) return EMPTY_THREAD_STATE;
  return byThreadKey[scopedThreadKey(ref)] ?? EMPTY_THREAD_STATE;
}

/**
 * The floating pane the preview player draws: the newest of `panes` showing a live page or
 * device. Others float as plain windows.
 */
export function floatingPreviewSource(
  state: ThreadRightPanelState,
  panes: readonly PaneKind[],
): { pane: PaneKind; source: PreviewMiniPlayerSource } | null {
  for (const pane of panes.toReversed()) {
    const surface = paneSurface(state, pane);
    if (surface?.kind === "preview" && surface.resourceId !== null) {
      return { pane, source: { kind: "browser", tabId: surface.resourceId } };
    }
    if (surface?.kind === "device" && surface.target) {
      return { pane, source: { kind: "device", ...surface.target } };
    }
  }
  return null;
}

/** The panes on screen: none while hidden, only the filled one while one fills. */
export function visiblePanes(state: ThreadRightPanelState): PaneKind[] {
  if (!state.isOpen) return [];
  const panes = layoutPanes(state.layout);
  return state.fill !== undefined && panes.includes(state.fill) ? [state.fill] : panes;
}

export function isPaneVisible(state: ThreadRightPanelState, pane: PaneKind): boolean {
  return visiblePanes(state).includes(pane);
}

/** The pane a narrow window's sheet shows: the focused one, else the first in the layout. */
export function sheetPane(state: ThreadRightPanelState): PaneKind | null {
  const panes = visiblePanes(state);
  const focused = focusedPaneOf(state);
  return focused !== null && panes.includes(focused) ? focused : (panes[0] ?? null);
}

/** The floating panes on screen: none while a pane fills the window. */
export function floatingPanes(state: ThreadRightPanelState): PaneKind[] {
  const minimizedPanes = state.minimized ?? [];
  if (minimizedPanes.length === 0) return minimizedPanes;
  const fill = state.fill;
  return state.isOpen && fill !== undefined && layoutHasTile(state.layout, fill)
    ? []
    : minimizedPanes;
}

/** Every pane the user can see, floating ones first. */
function panesOnScreen(state: ThreadRightPanelState): PaneKind[] {
  return [...floatingPanes(state), ...visiblePanes(state)];
}

/** The item a pane shows, whether or not the pane is on screen. */
export function paneSurface(
  state: ThreadRightPanelState,
  pane: PaneKind,
): RightPanelSurface | null {
  const id = state.paneSurfaceIds[pane];
  return id === undefined ? null : (state.surfaces.find((surface) => surface.id === id) ?? null);
}

export function selectPaneVisible(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
  pane: PaneKind,
): boolean {
  return isPaneVisible(selectThreadRightPanelState(byThreadKey, ref), pane);
}

/** What the focused pane shows, while it is on screen. */
export function selectActiveRightPanelSurface(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
): RightPanelSurface | null {
  const state = selectThreadRightPanelState(byThreadKey, ref);
  const pane = focusedPaneOf(state);
  return pane !== null && panesOnScreen(state).includes(pane) ? paneSurface(state, pane) : null;
}

export function selectSelectedRightPanelSurface(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
): RightPanelSurface | null {
  const state = selectThreadRightPanelState(byThreadKey, ref);
  const pane = focusedPaneOf(state);
  return pane === null ? null : paneSurface(state, pane);
}
