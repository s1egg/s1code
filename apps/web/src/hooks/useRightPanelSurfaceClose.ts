import {
  AuthOrchestrationOperateScope,
  AuthPreviewOperateScope,
  AuthTerminalOperateScope,
  type ScopedThreadRef,
} from "@s1tools/contracts";
import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import { getTerminalLabel } from "@s1tools/shared/terminalLabelsCopy";
import { agentControlledBrowserCloseConfirmation } from "../components/ChatView.logic";
import { closePreviewSession } from "../components/preview/closePreviewSession";
import { useThreadTerminalActions } from "../components/terminal/useThreadTerminalActions";
import { m } from "../i18n/messages";
import { confirmTerminalClose } from "../lib/terminalCloseConfirm";
import { focusTerminalAfterClose } from "../lib/terminalFocus";
import { readLocalApi } from "../localApi";
import { setActivePreviewTab, useThreadPreviewState } from "../previewStateStore";
import type { PaneKind } from "../paneLayout";
import {
  paneKindOf,
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
  type RightPanelSurface,
} from "../rightPanelStore";
import { readThreadShell } from "../state/entities";
import { previewEnvironment } from "../state/preview";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { useKnownTerminalSessions } from "../state/terminalSessions";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { useStableCallback } from "./useStableCallback";

/**
 * Closing releases preview and terminal sessions, and deletes a side chat that never ran.
 * Agent-driven browsers and the terminal pane's shells require confirmation.
 */
export function useRightPanelSurfaceClose(input: {
  readonly threadRef: ScopedThreadRef | null;
  readonly terminalLabelsById: ReadonlyMap<string, string>;
}) {
  const { threadRef, terminalLabelsById } = input;
  const closePreview = useAtomCommand(previewEnvironment.close, "preview close");
  const deleteThread = useAtomCommand(threadEnvironment.delete, "side chat delete");
  const canOperatePreview = useEnvironmentScope(
    threadRef?.environmentId ?? null,
    AuthPreviewOperateScope,
  );
  const previewState = useThreadPreviewState(threadRef);
  const terminalActions = useThreadTerminalActions(threadRef);
  const storeCloseTerminal = useTerminalUiStateStore((state) => state.closeTerminal);
  const surfaces = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, threadRef).surfaces,
  );
  const localTerminalIds = useTerminalUiStateStore(
    (state) => selectThreadTerminalUiState(state.terminalUiStateByThreadKey, threadRef).terminalIds,
  );
  // Local ids follow the server only while the terminal pane shows, so a shell an agent
  // started since then is known only to the server's list.
  const serverSessions = useKnownTerminalSessions({
    environmentId: threadRef?.environmentId ?? null,
    threadId: threadRef?.threadId ?? null,
  });
  const terminalIds = [
    ...new Set([
      ...localTerminalIds,
      ...(serverSessions ?? []).map((session) => session.target.terminalId),
    ]),
  ];

  const releaseSurfaceResources = (ref: ScopedThreadRef, surface: RightPanelSurface) => {
    // Without preview access, server state remains until an authorized close or restart.
    if (canOperatePreview && surface.kind === "preview" && surface.resourceId) {
      void closePreviewSession({
        closePreview,
        snapshot: previewState.sessions[surface.resourceId] ?? null,
        tabId: surface.resourceId,
        threadRef: ref,
      });
    }
    if (
      surface.kind === "terminal" &&
      readEnvironmentScope(ref.environmentId, AuthTerminalOperateScope)
    ) {
      for (const terminalId of terminalIds) {
        storeCloseTerminal(ref, terminalId);
        terminalActions.closeTerminalSession(terminalId, ref);
      }
    }
    if (
      surface.kind === "thread" &&
      // Only a side chat the shell still lists is thrown away with its tab; a subagent belongs to
      // its parent's work, and an unlisted side chat is already deleted.
      readThreadShell(scopeThreadRef(ref.environmentId, surface.threadId))?.lineage.sideChat ===
        true &&
      readEnvironmentScope(ref.environmentId, AuthOrchestrationOperateScope)
    ) {
      // The server keeps a side chat with a run or message. Reopen skips one it deleted.
      void deleteThread({
        environmentId: ref.environmentId,
        input: { threadId: surface.threadId, onlyIfUnused: true },
      });
    }
  };
  const closeAfterAgentBrowserConfirmation = (
    toClose: readonly RightPanelSurface[],
    closeSurfaces: () => void,
  ) => {
    const message = agentControlledBrowserCloseConfirmation(toClose, previewState);
    if (!message) {
      closeSurfaces();
      return;
    }
    const localApi = readLocalApi();
    if (!localApi) return;
    void localApi.dialogs.confirm(message, { variant: "destructive" }).then(
      (confirmed) => {
        if (confirmed) closeSurfaces();
      },
      () => undefined,
    );
  };
  // The active surface closes last so the panel does not flash through it.
  const finishClose = (toClose: readonly RightPanelSurface[]) => {
    if (!threadRef) return;
    const store = useRightPanelStore.getState();
    const activeId = selectThreadRightPanelState(store.byThreadKey, threadRef).activeSurfaceId;
    const ordered = toClose.toSorted(
      (left, right) => Number(left.id === activeId) - Number(right.id === activeId),
    );
    for (const surface of ordered) {
      // Releasing a browser drops its session, which prunes the tab automatically; close it
      // first so the close stays a user action that hides the panel after the last tab.
      store.closeSurface(threadRef, surface.id);
      releaseSurfaceResources(threadRef, surface);
    }
    const nextActiveSurface = selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      threadRef,
    );
    if (nextActiveSurface?.kind === "preview" && nextActiveSurface.resourceId) {
      setActivePreviewTab(threadRef, nextActiveSurface.resourceId);
    }
    focusTerminalAfterClose(threadRef, activeId);
  };
  const labelFor = (terminalId: string) =>
    terminalLabelsById.get(terminalId) ?? getTerminalLabel(terminalId, m);
  const closeSurfaces = (toClose: readonly RightPanelSurface[]) => {
    if (!threadRef) return;
    closeAfterAgentBrowserConfirmation(toClose, () => {
      const labels = readEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope)
        ? toClose.flatMap((surface) =>
            surface.kind === "terminal" ? terminalIds.map(labelFor) : [],
          )
        : [];
      const [first, ...rest] = labels;
      if (first === undefined) {
        finishClose(toClose);
        return;
      }
      void confirmTerminalClose([first, ...rest]).then((confirmed) => {
        if (confirmed) finishClose(toClose);
      });
    });
  };

  const closeSurface = useStableCallback((surface: RightPanelSurface) => closeSurfaces([surface]));
  const closePane = useStableCallback((pane: PaneKind) =>
    closeSurfaces(surfaces.filter((surface) => paneKindOf(surface.kind) === pane)),
  );
  const closeAllSurfaces = useStableCallback(() => closeSurfaces(surfaces));

  return { closeSurface, closePane, closeAllSurfaces };
}
