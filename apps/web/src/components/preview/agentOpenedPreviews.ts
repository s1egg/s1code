import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeThreadRef,
} from "@s1tools/client-runtime/environment";
import type {
  DeviceServiceState,
  EnvironmentId,
  PreviewSessionSnapshot,
  ScopedThreadRef,
  ThreadId,
} from "@s1tools/contracts";
import { AsyncResult } from "effect/reactivity";

import { getClientSettings } from "../../hooks/useSettings";
import {
  previewStateAtom,
  previewThreadRefsAtom,
  type ThreadPreviewState,
} from "../../previewStateStore";
import {
  browserSurface,
  deviceSurface,
  paneSurface,
  useRightPanelStore,
  type DeviceTabTarget,
} from "../../rightPanelStore";
import { RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY } from "../../rightPanelLayout";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { deviceEnvironment } from "../../state/device";
import { readEnvironmentSupportsServerBrowser } from "../../state/entities";
import { environmentSummaries } from "../../state/presentation";

/**
 * Shows browsers an agent or another client revealed for a thread: floating
 * over chat, or, when the reveal is forced, in the Browser pane that shows.
 */
export function revealServerTabs(
  threadRef: ScopedThreadRef,
  sessions: ReadonlyArray<PreviewSessionSnapshot>,
  options: { readonly autoShowFloatingPreview: boolean },
): void {
  if (!readEnvironmentSupportsServerBrowser(threadRef.environmentId)) return;
  for (const session of sessions) {
    const force = session.revealRequest?.force === true;
    if (!options.autoShowFloatingPreview && !force) continue;
    const panel = useRightPanelStore.getState().byThreadKey[scopedThreadKey(threadRef)];
    const surface = panel?.surfaces.find(
      (surface) => surface.kind === "preview" && surface.resourceId === session.tabId,
    );
    if (surface && force) {
      useRightPanelStore.getState().revealSurface(threadRef, surface.id);
    } else if (surface && panel?.waitingSurfaceIds?.includes(surface.id)) {
      // Pages open hidden and are revealed once loaded, by when they already wait as items.
      useRightPanelStore.getState().floatSurface(threadRef, surface, true);
    } else if (!surface) {
      useRightPanelStore
        .getState()
        .floatSurface(threadRef, browserSurface(session.tabId), true, force);
    }
  }
}

/**
 * Keeps a thread's browser pane items, floating ones included, in step with its
 * preview sessions. Server-hosted sessions are only complete once the first
 * list has loaded; before that, a missing session is not a closed one.
 */
export function followPreviewSessions(threadRef: ScopedThreadRef, state: ThreadPreviewState): void {
  if (readEnvironmentSupportsServerBrowser(threadRef.environmentId) && !state.listLoaded) return;
  useRightPanelStore.getState().reconcileBrowserSurfaces(
    threadRef,
    Object.values(state.sessions).map((session) => session.tabId),
  );
}

/**
 * Server tabs that are new, or carry a new reveal request, since `previous`.
 * Nothing is fresh until the first list has loaded: that list is the baseline,
 * so a reload never reopens previews the user dismissed. A tab this client was
 * closing comes back without a reveal if the close fails.
 */
function freshlyRevealedServerTabs(
  previous: ThreadPreviewState,
  next: ThreadPreviewState,
): ReadonlyArray<PreviewSessionSnapshot> {
  if (!previous.listLoaded || previous.sessions === next.sessions) return [];
  return Object.values(next.sessions).filter((session) => {
    if (session.runtime !== "server" || session.reveal !== true) return false;
    if (previous.suppressedTabIds.has(session.tabId)) return false;
    const before = previous.sessions[session.tabId];
    const requested = session.revealRequest;
    return requested ? before?.revealRequest?.id !== requested.id : before === undefined;
  });
}

function followThread(threadKey: string, threadRef: ScopedThreadRef): () => void {
  const atom = previewStateAtom(threadKey);
  let previous = appAtomRegistry.get(atom);
  return appAtomRegistry.subscribe(atom, (next) => {
    const before = previous;
    previous = next;
    // Reveals run first so a revealed tab floats before it gains a panel tab.
    const revealed = freshlyRevealedServerTabs(before, next);
    if (revealed.length > 0) {
      revealServerTabs(threadRef, revealed, {
        autoShowFloatingPreview: getClientSettings().browserAutoShowFloatingPreview,
      });
    }
    if (before.sessions !== next.sessions || before.listLoaded !== next.listLoaded) {
      followPreviewSessions(threadRef, next);
    }
  });
}

// `openedAt` tells a session apart from one that ended and reopened on the same device while
// this client was disconnected.
const sessionKey = (session: DeviceServiceState["sessions"][number]) =>
  `${session.threadId}:${session.hostId}:${session.deviceId}:${session.openedAt}`;

/**
 * Per environment: the device sessions seen in the last snapshot. The first
 * snapshot is a baseline, so persisted tabs restore themselves and existing
 * sessions never resurrect tabs the user closed. Baselines outlive a
 * disconnect, so a device an agent opened during the gap still shows.
 */
const deviceSessionBaselines = new Map<EnvironmentId, ReadonlySet<string>>();

function hasLiveSession(
  state: DeviceServiceState,
  threadId: ThreadId,
  target: { readonly hostId: string; readonly deviceId: string },
): boolean {
  return state.sessions.some(
    (session) =>
      session.threadId === threadId &&
      session.hostId === target.hostId &&
      session.deviceId === target.deviceId,
  );
}

/**
 * A device the agent opens floats over its thread's chat, or becomes a pane item
 * when floating previews are off; sheet layouts get neither. A session without a
 * device summary yet stays out of the baseline so a later snapshot opens it.
 * A floating device whose session ended stops floating here.
 */
export function applyDeviceSnapshot(
  environmentId: EnvironmentId,
  state: DeviceServiceState,
  options: { readonly sheetLayout: boolean; readonly autoShowFloatingPreview: boolean },
): void {
  const deviceFor = (session: DeviceServiceState["sessions"][number]) =>
    state.devices.find((entry) => entry.hostId === session.hostId && entry.id === session.deviceId);

  const panels = useRightPanelStore.getState();
  for (const [threadKey, panel] of Object.entries(panels.byThreadKey)) {
    if (!panel.minimized?.includes("device")) continue;
    const target = paneSurface(panel, "device");
    const ref = parseScopedThreadKey(threadKey);
    if (
      ref?.environmentId === environmentId &&
      target?.kind === "device" &&
      target.target !== undefined &&
      !hasLiveSession(state, ref.threadId, target.target)
    ) {
      panels.dismissFloatingPane(ref, "device");
    }
  }

  const previous = deviceSessionBaselines.get(environmentId);
  deviceSessionBaselines.set(
    environmentId,
    new Set(state.sessions.filter((session) => deviceFor(session) !== undefined).map(sessionKey)),
  );
  if (!previous || options.sheetLayout) return;
  for (const session of state.sessions) {
    if (previous.has(sessionKey(session))) continue;
    const device = deviceFor(session);
    if (!device) continue;
    const threadRef = scopeThreadRef(environmentId, session.threadId);
    const target = {
      hostId: session.hostId,
      deviceId: session.deviceId,
      platform: device.platform,
      name: device.name,
    };
    if (options.autoShowFloatingPreview) {
      useRightPanelStore.getState().floatSurface(threadRef, deviceSurface(target), true);
      continue;
    }
    const existing = useRightPanelStore
      .getState()
      .byThreadKey[scopedThreadKey(threadRef)]?.surfaces.some(
        (surface) =>
          surface.kind === "device" &&
          surface.target?.hostId === session.hostId &&
          surface.target.deviceId === session.deviceId,
      );
    if (existing) continue;
    useRightPanelStore.getState().openDevice(threadRef, target, true);
  }
}

/**
 * Whether a device pane leaving the screen has a stream to keep floating. Before the first
 * device snapshot it does, and that snapshot stops the float if the session already ended.
 */
export function deviceSessionLive(
  threadRef: ScopedThreadRef,
  target: DeviceTabTarget,
  state: DeviceServiceState | null,
): boolean {
  return state === null || hasLiveSession(state, threadRef.threadId, target);
}

export function resetDeviceSessionBaselinesForTests(): void {
  deviceSessionBaselines.clear();
}

function watchEnvironmentDevices(environmentId: EnvironmentId): () => void {
  return appAtomRegistry.subscribe(
    deviceEnvironment.state({ environmentId, input: {} }),
    (result) => {
      const state = AsyncResult.getOrElse(result, () => null);
      if (state === null) return;
      applyDeviceSnapshot(environmentId, state, {
        sheetLayout: window.matchMedia(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY).matches,
        autoShowFloatingPreview: getClientSettings().browserAutoShowFloatingPreview,
      });
    },
    { immediate: true },
  );
}

/**
 * Follows every thread's browser previews and every connected environment's
 * device sessions for the life of the page, not just the open thread's: an
 * agent in a background thread can open either.
 */
export function startAgentOpenedPreviews(): () => void {
  const followed = new Map<string, () => void>();
  const followNewThreads = (refs: ReadonlyMap<string, ScopedThreadRef>) => {
    for (const [threadKey, threadRef] of refs) {
      if (!followed.has(threadKey)) followed.set(threadKey, followThread(threadKey, threadRef));
    }
  };
  const stopIndex = appAtomRegistry.subscribe(previewThreadRefsAtom, followNewThreads, {
    immediate: true,
  });
  const watchedEnvironments = new Map<EnvironmentId, () => void>();
  const watchConnectedEnvironments = (environmentIds: ReadonlyArray<EnvironmentId>) => {
    for (const [environmentId, stop] of watchedEnvironments) {
      if (environmentIds.includes(environmentId)) continue;
      stop();
      watchedEnvironments.delete(environmentId);
    }
    for (const environmentId of environmentIds) {
      if (!watchedEnvironments.has(environmentId)) {
        watchedEnvironments.set(environmentId, watchEnvironmentDevices(environmentId));
      }
    }
  };
  const stopEnvironments = appAtomRegistry.subscribe(
    environmentSummaries.connectedEnvironmentIdsAtom,
    watchConnectedEnvironments,
    { immediate: true },
  );
  return () => {
    stopIndex();
    stopEnvironments();
    for (const stop of followed.values()) stop();
    for (const stop of watchedEnvironments.values()) stop();
  };
}
