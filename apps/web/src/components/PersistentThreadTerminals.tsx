import {
  AuthTerminalOperateScope,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
} from "@s1tools/contracts";
import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeProjectRef,
} from "@s1tools/client-runtime/environment";
import { projectScriptCwd, projectScriptRuntimeEnv } from "@s1tools/shared/projectScripts";
import { resolveTerminalSessionLabel } from "@s1tools/shared/terminalLabelsCopy";
import { useMessages } from "gt-react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { useComposerDraftStore } from "../composerDraftStore";
import { useStableCallback } from "../hooks/useStableCallback";
import type { TerminalContextSelection } from "../lib/terminalContext";
import { focusActiveTerminal, focusTerminal } from "../lib/terminalFocus";
import { isPaneVisible, useRightPanelStore } from "../rightPanelStore";
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
 * server, so hiding the pane unmounts the views and keeps the shells; `KeptThreadTerminals`
 * keeps recent threads' views across thread switches.
 */
const PersistentThreadTerminalPane = memo(function PersistentThreadTerminalPane({
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

/** Recent threads whose terminal views stay mounted while another thread shows. */
const MAX_HIDDEN_KEPT_TERMINAL_THREADS = 10;

/**
 * Each kept thread's views render into one element that moves between the pane showing them and
 * a hidden parking spot, so switching threads neither remounts a terminal nor replays its output.
 * Hosts and slots register from effects that undo exactly what they did, so StrictMode's effect
 * replay re-registers them instead of leaving the views in a detached element.
 */
const terminalHosts = new Map<string, HTMLDivElement>();
const terminalSlots = new Map<string, HTMLElement>();
let terminalParking: HTMLElement | null = null;

function placeTerminalHost(threadKey: string) {
  const host = terminalHosts.get(threadKey);
  const target = terminalSlots.get(threadKey) ?? terminalParking;
  if (host && target && host.parentElement !== target) target.appendChild(host);
}

const useTerminalSlotStore = create<{
  /** Threads whose terminal pane is on screen now. */
  readonly shown: readonly string[];
  /** Threads whose terminal pane showed, least recent first. */
  readonly recent: readonly string[];
}>(() => ({ shown: [], recent: [] }));

const withoutOne = (keys: readonly string[], key: string) => {
  const index = keys.indexOf(key);
  return index < 0 ? keys : [...keys.slice(0, index), ...keys.slice(index + 1)];
};

/** Where the terminal pane shows its thread's views. */
export function TerminalPaneSlot(props: { readonly threadRef: ScopedThreadRef }) {
  const threadKey = scopedThreadKey(props.threadRef);
  const slotRef = useRef<HTMLDivElement | null>(null);
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- moves the thread's kept terminal views into this pane before paint and back to parking when it goes
  useLayoutEffect(() => {
    const element = slotRef.current;
    if (!element) return;
    terminalSlots.set(threadKey, element);
    placeTerminalHost(threadKey);
    useTerminalSlotStore.setState((state) => ({
      shown: [...state.shown, threadKey],
      recent: [...state.recent.filter((key) => key !== threadKey), threadKey].slice(
        -MAX_HIDDEN_KEPT_TERMINAL_THREADS * 2,
      ),
    }));
    return () => {
      if (terminalSlots.get(threadKey) === element) terminalSlots.delete(threadKey);
      placeTerminalHost(threadKey);
      useTerminalSlotStore.setState((state) => ({ shown: withoutOne(state.shown, threadKey) }));
    };
  }, [threadKey]);
  return <div ref={slotRef} className="flex min-h-0 min-w-0 flex-1 flex-col" />;
}

type KeptTerminalProps = Omit<PersistentThreadTerminalPaneProps, "visible" | "threadRef">;

/**
 * Mounts the terminal views of the thread on screen and of recent threads whose terminal pane
 * was showing, so coming back to one finds its output and scroll position as they were.
 */
export function KeptThreadTerminals(props: {
  readonly activeThreadKey: string | null;
  readonly active: KeptTerminalProps;
}) {
  const { shown, recent } = useTerminalSlotStore();
  const waiting = useRightPanelStore(
    useShallow((state) =>
      recent.filter((key) => {
        const panel = state.byThreadKey[key];
        return (
          !shown.includes(key) &&
          panel !== undefined &&
          (isPaneVisible(panel, "terminal") || panel.minimized?.includes("terminal") === true)
        );
      }),
    ),
  );
  const kept = [...new Set([...waiting.slice(-MAX_HIDDEN_KEPT_TERMINAL_THREADS), ...shown])];
  const hidden: KeptTerminalProps = {
    launchContext: null,
    keybindings: props.active.keybindings,
    onAddTerminalContext: props.active.onAddTerminalContext,
  };
  return (
    <div
      hidden
      ref={(element) => {
        terminalParking = element;
        if (element) for (const threadKey of terminalHosts.keys()) placeTerminalHost(threadKey);
      }}
    >
      {kept.map((threadKey) => (
        <KeptThreadTerminal
          key={threadKey}
          threadKey={threadKey}
          visible={shown.includes(threadKey)}
          paneProps={threadKey === props.activeThreadKey ? props.active : hidden}
        />
      ))}
    </div>
  );
}

function KeptThreadTerminal(props: {
  readonly threadKey: string;
  readonly visible: boolean;
  readonly paneProps: KeptTerminalProps;
}) {
  const { threadKey } = props;
  const threadRef = parseScopedThreadKey(threadKey);
  const [host] = useState(() => {
    const element = document.createElement("div");
    element.className = "flex min-h-0 min-w-0 flex-1 flex-col";
    return element;
  });
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- registers the thread's host element where its pane slot can find it, and drops it once its views stop being kept
  useLayoutEffect(() => {
    terminalHosts.set(threadKey, host);
    placeTerminalHost(threadKey);
    return () => {
      if (terminalHosts.get(threadKey) === host) terminalHosts.delete(threadKey);
      host.remove();
    };
  }, [host, threadKey]);
  if (!threadRef) return null;
  return createPortal(
    <PersistentThreadTerminalPane
      {...props.paneProps}
      visible={props.visible}
      threadRef={threadRef}
    />,
    host,
  );
}
