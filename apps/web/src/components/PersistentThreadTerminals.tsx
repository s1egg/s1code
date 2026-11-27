import {
  AuthTerminalOperateScope,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
} from "@s1tools/contracts";
import { scopeProjectRef } from "@s1tools/client-runtime/environment";
import { projectScriptCwd, projectScriptRuntimeEnv } from "@s1tools/shared/projectScripts";
import { resolveTerminalSessionLabel } from "@s1tools/shared/terminalLabelsCopy";
import { useMessages } from "gt-react";
import { memo, useEffect } from "react";
import { useComposerDraftStore } from "../composerDraftStore";
import { useStableCallback } from "../hooks/useStableCallback";
import type { TerminalContextSelection } from "../lib/terminalContext";
import { focusActiveTerminal, focusTerminal } from "../lib/terminalFocus";
import { useProject, useQuietThreadShell } from "../state/entities";
import { useEnvironmentScope } from "../state/session";
import { useTerminalDrawerSessions } from "../state/terminalSessions";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { useThreadTerminalActions } from "./terminal/useThreadTerminalActions";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";

/** Where the pane opens new terminals when a script run overrides the thread's own. */
export type PersistentTerminalLaunchContext = {
  readonly cwd: string;
  readonly worktreePath: string | null;
};

interface TerminalLaunchLocationWithEnv {
  readonly cwd: string;
  readonly worktreePath: string | null;
  readonly runtimeEnv: Record<string, string>;
}

export interface PersistentThreadTerminalPaneProps {
  visible: boolean;
  threadRef: ScopedThreadRef;
  launchContext: PersistentTerminalLaunchContext | null;
  keybindings: ResolvedKeybindingsConfig;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  splitShortcutLabel?: string | undefined;
  splitVerticalShortcutLabel?: string | undefined;
  newShortcutLabel?: string | undefined;
  closeShortcutLabel?: string | undefined;
}

/**
 * The terminal pane: every terminal of the thread, grouped into splits. Sessions live on the
 * server, so hiding the pane or switching threads unmounts the views and keeps the shells.
 */
export const PersistentThreadTerminalPane = memo(function PersistentThreadTerminalPane({
  visible,
  threadRef,
  launchContext,
  keybindings,
  onAddTerminalContext,
  splitShortcutLabel,
  splitVerticalShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
}: PersistentThreadTerminalPaneProps) {
  const messages = useMessages();
  const canOperateTerminal = useEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope);
  const terminalActions = useThreadTerminalActions(threadRef);
  const serverThread = useQuietThreadShell(threadRef);
  const draftThread = useComposerDraftStore((store) => store.getDraftThreadByRef(threadRef));
  const projectRef = serverThread
    ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
    : draftThread
      ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
      : null;
  const project = useProject(projectRef);
  const terminalUiState = useTerminalUiStateStore((state) =>
    selectThreadTerminalUiState(state.terminalUiStateByThreadKey, threadRef),
  );
  const metadata = useTerminalDrawerSessions(threadRef.environmentId, threadRef.threadId);
  const knownTerminalSessions = metadata?.sessions ?? [];
  const snapshotId = metadata?.snapshotId;
  const terminalLabelsById = new Map<string, string>();
  const terminalLaunchLocationsById = new Map<string, TerminalLaunchLocationWithEnv>();
  for (const session of knownTerminalSessions) {
    const summary = session.state.summary;
    terminalLabelsById.set(
      session.target.terminalId,
      resolveTerminalSessionLabel(session.target.terminalId, summary, messages),
    );
    if (!project || !summary) continue;
    const worktreePathForLaunch =
      launchContext !== null ? launchContext.worktreePath : summary.worktreePath;
    terminalLaunchLocationsById.set(session.target.terminalId, {
      cwd: launchContext?.cwd ?? summary.cwd,
      worktreePath: worktreePathForLaunch,
      runtimeEnv: projectScriptRuntimeEnv({
        project: { cwd: project.workspaceRoot },
        worktreePath: worktreePathForLaunch,
      }),
    });
  }
  const serverOrderedTerminalIds = knownTerminalSessions.map(
    (session) => session.target.terminalId,
  );
  const storeSplitTerminal = useTerminalUiStateStore((state) => state.splitTerminal);
  const storeSplitTerminalVertical = useTerminalUiStateStore(
    (state) => state.splitTerminalVertical,
  );
  const storeNewTerminal = useTerminalUiStateStore((state) => state.newTerminal);
  const storeSetActiveTerminal = useTerminalUiStateStore((state) => state.setActiveTerminal);
  const storeCloseTerminal = useTerminalUiStateStore((state) => state.closeTerminal);
  const reconcileTerminalIds = useTerminalUiStateStore((state) => state.reconcileTerminalIds);

  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- feeds the server's terminal list into the terminal UI store, which owns how local ids follow it
  useEffect(() => {
    if (snapshotId === undefined) return;
    reconcileTerminalIds(threadRef, serverOrderedTerminalIds, snapshotId);
  }, [reconcileTerminalIds, serverOrderedTerminalIds, snapshotId, threadRef]);
  const worktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const effectiveWorktreePath = launchContext !== null ? launchContext.worktreePath : worktreePath;
  const cwd =
    launchContext?.cwd ??
    (project
      ? projectScriptCwd({
          project: { cwd: project.workspaceRoot },
          worktreePath: effectiveWorktreePath,
        })
      : null);
  const runtimeEnv = project
    ? projectScriptRuntimeEnv({
        project: { cwd: project.workspaceRoot },
        worktreePath: effectiveWorktreePath,
      })
    : {};

  const launchPaneTerminal = (place: (terminalId: string) => void) => {
    if (!cwd) return;
    const launched = terminalActions.launchTerminal({
      place,
      location: { cwd, worktreePath: effectiveWorktreePath },
    });
    if (!launched) return;
    if (visible) focusTerminal(threadRef, launched.terminalId);
    void launched.result;
  };
  const splitTerminal = useStableCallback(() =>
    launchPaneTerminal((terminalId) => storeSplitTerminal(threadRef, terminalId)),
  );
  const splitTerminalVertical = useStableCallback(() =>
    launchPaneTerminal((terminalId) => storeSplitTerminalVertical(threadRef, terminalId)),
  );
  const createNewTerminal = useStableCallback(() =>
    launchPaneTerminal((terminalId) => storeNewTerminal(threadRef, terminalId)),
  );

  const activateTerminal = (terminalId: string) => {
    storeSetActiveTerminal(threadRef, terminalId);
    if (visible) focusTerminal(threadRef, terminalId);
  };

  const closeTerminal = useStableCallback((terminalId: string) => {
    if (!terminalActions.canWrite()) return;
    terminalActions.closeTerminalSession(terminalId);
    storeCloseTerminal(threadRef, terminalId);
    if (visible) focusActiveTerminal(threadRef);
  });

  const handleAddTerminalContext = (selection: TerminalContextSelection) => {
    if (visible) onAddTerminalContext(selection);
  };

  if (!project || !cwd) return null;

  return (
    <ThreadTerminalDrawer
      threadRef={threadRef}
      threadId={threadRef.threadId}
      cwd={cwd}
      worktreePath={effectiveWorktreePath}
      runtimeEnv={runtimeEnv}
      visible={visible}
      // Known-session order is MRU and changes on focus; persisted store order keeps labels stable.
      terminalIds={canOperateTerminal ? terminalUiState.terminalIds : serverOrderedTerminalIds}
      activeTerminalId={terminalUiState.activeTerminalId}
      terminalGroups={terminalUiState.terminalGroups}
      activeTerminalGroupId={terminalUiState.activeTerminalGroupId}
      onSplitTerminal={splitTerminal}
      onSplitTerminalVertical={splitTerminalVertical}
      onNewTerminal={createNewTerminal}
      splitShortcutLabel={visible ? splitShortcutLabel : undefined}
      splitVerticalShortcutLabel={visible ? splitVerticalShortcutLabel : undefined}
      newShortcutLabel={visible ? newShortcutLabel : undefined}
      closeShortcutLabel={visible ? closeShortcutLabel : undefined}
      keybindings={keybindings}
      onActiveTerminalChange={activateTerminal}
      onCloseTerminal={closeTerminal}
      onAddTerminalContext={handleAddTerminalContext}
      terminalLabelsById={terminalLabelsById}
      terminalLaunchLocationsById={terminalLaunchLocationsById}
    />
  );
});
