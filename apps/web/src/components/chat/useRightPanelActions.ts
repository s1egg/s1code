import { msg } from "gt-react";
import { errorDisplayMessage, thrownErrorMessage } from "@s1tools/client-runtime/errors";
import { m } from "~/i18n/messages";
import type { ToolCallDiffTarget } from "../../diffPanelStore";
import type { EnvironmentProject } from "@s1tools/client-runtime/state/shell";
import type { ThreadPreviewState } from "../../previewStateStore";
import { formatFilePathForClipboard } from "@s1tools/client-runtime/media-actions";
import { resolvePathLinkTarget } from "@s1tools/shared/fileLinks";
import { useStableCallback } from "../../hooks/useStableCallback";
import { type ScopedThreadRef, type PreviewSessionSnapshot } from "@s1tools/contracts";
import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import { sideThreadComposer, sideThreadKindOf } from "@s1tools/client-runtime/side-thread";
import { readThreadShell } from "../../state/entities";
import { scopedThreadKey } from "@s1tools/client-runtime/environment";
import { useEffect } from "react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@s1tools/client-runtime/state/runtime";
import { useDiffPanelStore } from "../../diffPanelStore";
import { type ThreadPanelPresentation } from "../../rightPanelLayout";
import type { PaneKind } from "../../paneLayout";
import {
  isPaneVisible,
  paneKindOf,
  paneSurface,
  selectThreadRightPanelState,
  sheetPane,
  visiblePanes,
  type RightPanelSurface,
  useRightPanelStore,
} from "../../rightPanelStore";
import { getClientSettings, updateClientSettings } from "../../hooks/useSettings";
import { useThreadDetailsStore } from "./threadDetailsStore";
import { requestWorkspaceContentFocus, requestWorkspaceFocus } from "../../lib/workspaceFocus";
import { setActivePreviewTab } from "../../previewStateStore";
import { isBrowserSettingsReadError } from "../../browser/openFileInPreview";
import { addBrowserSurface } from "../preview/addBrowserSurface";
import { focusActiveTerminal } from "../../lib/terminalFocus";
import { subscribePreviewAction } from "../preview/previewActionBus";
import { deviceSessionLive } from "../preview/agentOpenedPreviews";
import type { threadPullRequestPanelTarget } from "../pullRequest/pullRequestDetail.logic";
import type { useDeviceState } from "../../state/device";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { openDeviceSetupDialog } from "./ChatOverlayHosts";
import { previewEnvironment } from "../../state/preview";
import { useAtomCommand } from "../../state/use-atom-command";
import type { ChatShortcutCommands } from "./useChatShortcuts";
interface RightPanelActionsInput {
  readonly activeThreadRef: ScopedThreadRef | null;
  readonly activeProject: EnvironmentProject | null;
  readonly activeRightPanelSurface: RightPanelSurface | null;
  readonly activePreviewState: ThreadPreviewState;
  readonly deviceState: ReturnType<typeof useDeviceState>["state"];
  readonly deviceStateLoaded: boolean;
  readonly pullRequestPanelTarget: ReturnType<typeof threadPullRequestPanelTarget> | null;
  readonly threadPanelPresentation: ThreadPanelPresentation;
  readonly isServerThread: boolean;
  /** A side chat pane; the main view already answers preview bus actions. */
  readonly embedded: boolean;
  /** The thread has a diff to show: a Git folder, or turns that changed tracked repositories. */
  readonly diffAvailable: boolean;
  readonly browserAvailable: boolean;
  readonly canOperatePreview: boolean;
  readonly diffOpen: boolean;
  readonly previewPanelOpen: boolean;
  readonly rightPanelOpen: boolean;
  /** Narrow windows show one pane at a time in a sheet. */
  readonly paneSheet: boolean;
  readonly supportsPullRequests: boolean;
  readonly pullRequestsSurfaceAvailable: boolean;
  readonly gitCwd: string | null;
  readonly activeProjectCwd: string | null;
  readonly onDiffPanelOpen: (() => void) | undefined;
  readonly closePane: (pane: PaneKind) => void;
  readonly openMoreMenu: () => void;
}

/**
 * Opening, hiding, filling and closing the thread's panes: browser, diff, files, pull requests,
 * device and the rest.
 */
export function useRightPanelActions(input: RightPanelActionsInput) {
  const {
    closePane,
    openMoreMenu,
    activeThreadRef,
    activeProject,
    activeRightPanelSurface,
    activePreviewState,
    deviceState,
    deviceStateLoaded,
    pullRequestPanelTarget,
    threadPanelPresentation,
    isServerThread,
    embedded,
    diffAvailable,
    browserAvailable,
    canOperatePreview,
    diffOpen,
    previewPanelOpen,
    rightPanelOpen,
    paneSheet,
    supportsPullRequests,
    pullRequestsSurfaceAvailable,
    gitCwd,
    activeProjectCwd,
    onDiffPanelOpen,
  } = input;

  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const onToggleDiff = () => {
    if (!diffOpen) {
      onDiffPanelOpen?.();
    }
    if (activeThreadRef) useRightPanelStore.getState().toggle(activeThreadRef, "diff");
  };
  const onToggleDiffStable = useStableCallback(onToggleDiff);
  const createBrowserSurface = (profileId?: string, duplicateFrom?: PreviewSessionSnapshot) => {
    if (!activeThreadRef || !canOperatePreview) return;
    void addBrowserSurface({
      threadRef: activeThreadRef,
      openPreview,
      ...(profileId === undefined ? {} : { profileId }),
      ...(duplicateFrom === undefined ? {} : { duplicateFrom }),
    }).then((result) => {
      if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      if (isBrowserSettingsReadError(error)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: m(msg("Unable to open browser")),
            description: errorDisplayMessage(error, m) ?? error.message,
          }),
        );
      }
    });
  };
  const duplicateBrowserSurface = (surface: RightPanelSurface) => {
    if (surface.kind !== "preview" || !surface.resourceId) return;
    const snapshot = activePreviewState.sessions[surface.resourceId];
    if (snapshot) createBrowserSurface(undefined, snapshot);
  };
  const duplicateBrowserSurfaceStable = useStableCallback(duplicateBrowserSurface);
  const addDiffSurface = () => {
    if (!activeThreadRef || !diffAvailable) return;
    useDiffPanelStore.getState().selectGitScope(activeThreadRef, "branch");
    useRightPanelStore.getState().open(activeThreadRef, "diff");
    onDiffPanelOpen?.();
  };
  const openChangesFromThreadPanel = () => {
    addDiffSurface();
  };
  const openChangesFromThreadPanelStable = useStableCallback(openChangesFromThreadPanel);
  const toggleFilesPane = () => {
    if (!activeThreadRef || !activeProject) return;
    useRightPanelStore.getState().toggle(activeThreadRef, "files");
  };
  const toggleFilesPaneStable = useStableCallback(toggleFilesPane);
  const addPullRequestsSurface = () => {
    if (!activeThreadRef || !pullRequestsSurfaceAvailable) return;
    useRightPanelStore.getState().open(activeThreadRef, "pull-requests");
  };
  const addPullRequestsSurfaceStable = useStableCallback(addPullRequestsSurface);
  const addDeviceSurface = () => {
    if (!activeThreadRef) return;
    if (!deviceState.onboardingCompleted || deviceState.hostStatus === "disabled") {
      openDeviceSetupDialog(scopedThreadKey(activeThreadRef));
      return;
    }
    useRightPanelStore.getState().open(activeThreadRef, "device");
  };
  const addDeviceSurfaceStable = useStableCallback(addDeviceSurface);
  const openFileSurface = (relativePath: string) => {
    if (!activeThreadRef || !activeProject) return;
    useRightPanelStore.getState().openFile(activeThreadRef, relativePath);
  };
  const openFileSurfaceStable = useStableCallback(openFileSurface);
  const panelState = () =>
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, activeThreadRef);
  /** A live page or device leaving the screen keeps playing in a floating window. */
  const floatsWhenHidden = (pane: PaneKind) => {
    if (!activeThreadRef) return false;
    const surface = paneSurface(panelState(), pane);
    if (surface?.kind === "preview") return surface.resourceId !== null && canOperatePreview;
    return (
      surface?.kind === "device" &&
      surface.target !== undefined &&
      deviceSessionLive(activeThreadRef, surface.target, deviceStateLoaded ? deviceState : null)
    );
  };
  const hidePane = (pane: PaneKind) => {
    if (!activeThreadRef) return;
    const store = useRightPanelStore.getState();
    if (floatsWhenHidden(pane)) store.minimizePane(activeThreadRef, pane);
    else store.hidePane(activeThreadRef, pane);
  };
  /** Hides a pane on screen, or shows it, opening `create` when it has nothing yet. */
  const togglePane = (pane: PaneKind, create?: () => void) => {
    if (!activeThreadRef) return;
    if (isPaneVisible(panelState(), pane)) {
      hidePane(pane);
      return;
    }
    if (useRightPanelStore.getState().showPane(activeThreadRef, pane)) return;
    create?.();
  };
  const togglePaneStable = useStableCallback(togglePane);
  const hideAllPanes = () => {
    if (!activeThreadRef) return;
    const state = panelState();
    // The sheet shows one pane, so only that one is on screen to hand off.
    const shown = paneSheet
      ? [sheetPane(state)].filter((pane) => pane !== null)
      : visiblePanes(state);
    useRightPanelStore.getState().hideAll(activeThreadRef, shown.filter(floatsWhenHidden));
  };
  const hideAllPanesStable = useStableCallback(hideAllPanes);
  const togglePreviewPanel = () => {
    if (!activeThreadRef || !browserAvailable) return;
    if (previewPanelOpen) {
      hidePane("browser");
      return;
    }
    if (useRightPanelStore.getState().showPane(activeThreadRef, "browser")) return;
    if (!canOperatePreview) return;
    const activeTabId = activePreviewState.activeTabId;
    if (activeTabId) {
      useRightPanelStore.getState().openBrowser(activeThreadRef, activeTabId);
    } else {
      createBrowserSurface();
    }
  };
  const togglePreviewPanelStable = useStableCallback(togglePreviewPanel);
  const activateRightPanelSurface = (surface: RightPanelSurface) => {
    if (!activeThreadRef) return;
    useRightPanelStore.getState().activateSurface(activeThreadRef, surface.id);
    if (surface.kind === "preview" && surface.resourceId) {
      setActivePreviewTab(activeThreadRef, surface.resourceId);
    }
    if (surface.kind === "terminal") focusActiveTerminal(activeThreadRef);
    if (surface.kind === "thread") {
      const kind = sideThreadKindOf(
        readThreadShell(scopeThreadRef(activeThreadRef.environmentId, surface.threadId)),
      );
      // A thread with no composer, or one not known yet, takes focus as any other tab does.
      requestWorkspaceFocus(
        kind !== null && sideThreadComposer(kind) === "composer"
          ? {
              area: "panel",
              selector: `[data-side-chat-pane="${CSS.escape(surface.threadId)}"] [data-workspace-area="composer"] [contenteditable="true"]`,
            }
          : { area: "panel" },
      );
    }
    if (surface.kind === "diff" && !diffOpen) {
      onDiffPanelOpen?.();
    }
  };
  const activateRightPanelSurfaceStable = useStableCallback(activateRightPanelSurface);
  const toggleRightPanel = () => {
    if (!activeThreadRef) return;
    if (rightPanelOpen) {
      hideAllPanes();
      return;
    }
    useRightPanelStore.getState().show(activeThreadRef);
    focusActiveTerminal(activeThreadRef);
  };
  const toggleRightPanelStable = useStableCallback(toggleRightPanel);
  const toggleThreadPanel = () => {
    if (!activeThreadRef) return;
    if (threadPanelPresentation === "popover") {
      const store = useThreadDetailsStore.getState();
      store.setPopoverOpen(!store.popoverOpen);
      return;
    }
    const open = getClientSettings().threadDetailsOpen;
    if (!open) requestWorkspaceFocus({ area: "details" });
    else if (document.activeElement?.closest('[data-workspace-area="details"]'))
      requestWorkspaceContentFocus();
    void updateClientSettings({ threadDetailsOpen: !open });
  };
  const toggleThreadPanelStable = useStableCallback(toggleThreadPanel);
  /** Fills the window with the focused pane, or restores the layout. */
  const toggleFill = () => {
    if (!activeThreadRef) return;
    const state = selectThreadRightPanelState(
      useRightPanelStore.getState().byThreadKey,
      activeThreadRef,
    );
    if (state.fill !== undefined) {
      useRightPanelStore.getState().setFill(activeThreadRef, null);
      return;
    }
    if (!activeRightPanelSurface) return;
    requestWorkspaceFocus({ area: "panel" });
    useRightPanelStore
      .getState()
      .setFill(activeThreadRef, paneKindOf(activeRightPanelSurface.kind));
  };
  const toggleFillStable = useStableCallback(toggleFill);
  const copyRightPanelFilePath = (relativePath: string) => {
    if (typeof window === "undefined" || !navigator.clipboard?.writeText) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: m(msg("Failed to copy path")),
          description: m(msg("Clipboard API unavailable.")),
        }),
      );
      return;
    }

    const clipboardPath = formatFilePathForClipboard(
      relativePath,
      resolvePathLinkTarget(relativePath, gitCwd ?? activeProjectCwd ?? ""),
    );
    void navigator.clipboard.writeText(clipboardPath).then(undefined, (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: m(msg("Failed to copy path")),
          description: thrownErrorMessage(error, m) ?? m(msg("An error occurred.")),
        }),
      );
    });
  };
  const copyRightPanelFilePathStable = useStableCallback(copyRightPanelFilePath);
  const addPullRequestSurface = () => {
    if (!supportsPullRequests || activeThreadRef === null || pullRequestPanelTarget === null)
      return;
    useRightPanelStore.getState().openPullRequest(activeThreadRef, pullRequestPanelTarget);
  };
  const togglePullRequestPane = () => {
    if (!activeThreadRef) return;
    const state = selectThreadRightPanelState(
      useRightPanelStore.getState().byThreadKey,
      activeThreadRef,
    );
    if (state.paneSurfaceIds["pull-request"] !== undefined) {
      useRightPanelStore.getState().togglePane(activeThreadRef, "pull-request");
      return;
    }
    addPullRequestSurface();
  };
  const togglePullRequestPaneStable = useStableCallback(togglePullRequestPane);
  const onOpenToolDiffStable = useStableCallback((target: ToolCallDiffTarget) => {
    if (!isServerThread || !activeThreadRef) return;
    useDiffPanelStore.getState().selectToolCall(activeThreadRef, target);
    useRightPanelStore.getState().open(activeThreadRef, "diff");
    onDiffPanelOpen?.();
  });
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- subscribes to the preview action bus to toggle the preview panel
  useEffect(
    () =>
      embedded
        ? undefined
        : subscribePreviewAction((action) => {
            if (action === "toggle-panel") togglePreviewPanelStable();
          }),
    [embedded, togglePreviewPanelStable],
  );

  const shortcuts = {
    "rightPanel.toggle": () => toggleRightPanel(),
    "rightPanel.toggleMaximized": ({ event }) => {
      if (!event.repeat) toggleFill();
    },
    "rightPanel.new": ({ event }) => {
      if (!event.repeat) openMoreMenu();
    },
    "threadPanel.toggle": () => toggleThreadPanel(),
    "rightPanel.close": ({ event }) => {
      if (!activeRightPanelSurface) return false;
      if (!event.repeat) closePane(paneKindOf(activeRightPanelSurface.kind));
    },
    "diff.toggle": () => onToggleDiff(),
  } satisfies ChatShortcutCommands;

  return {
    shortcuts,
    activateRightPanelSurfaceStable,
    addDeviceSurfaceStable,
    addPullRequestsSurfaceStable,
    copyRightPanelFilePathStable,
    createBrowserSurface,
    duplicateBrowserSurfaceStable,
    hideAllPanesStable,
    onOpenToolDiffStable,
    onToggleDiffStable,
    openChangesFromThreadPanelStable,
    openFileSurfaceStable,
    toggleFilesPaneStable,
    toggleFillStable,
    togglePaneStable,
    togglePreviewPanelStable,
    togglePullRequestPaneStable,
    toggleRightPanelStable,
    toggleThreadPanelStable,
  };
}
