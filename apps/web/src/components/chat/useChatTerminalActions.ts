import { msg } from "gt-react";
import { thrownErrorMessage } from "@s1tools/client-runtime/errors";
import { m } from "~/i18n/messages";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@s1tools/client-runtime/state/shell";
import type { Dispatch } from "react";
import type { ComposerHandleRef } from "../../composerHandleContext";
import type { selectThreadTerminalUiState } from "../../terminalUiStateStore";
import { useStableCallback } from "../../hooks/useStableCallback";
import { useThreadTerminalActions } from "../terminal/useThreadTerminalActions";
import { getTerminalLabel } from "@s1tools/shared/terminalLabelsCopy";
import {
  AuthTerminalReadScope,
  AuthTerminalOperateScope,
  type EnvironmentId,
  type ProjectScript,
  type ScopedThreadRef,
  type ThreadId,
} from "@s1tools/contracts";
import { projectScriptTerminalInput } from "@s1tools/shared/projectScripts";
import { type SetStateAction } from "react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@s1tools/client-runtime/state/runtime";
import { MAX_TERMINALS_PER_GROUP } from "../../types";
import { useRightPanelStore } from "../../rightPanelStore";
import { openUrlInPreview } from "../../browser/openFileInPreview";
import { isPreviewAvailableFor } from "../../browser/previewRuntime";
import { resolveDiscoveredServerUrl } from "../../browser/browserTargetResolver";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { cycleThreadTerminal } from "../../lib/cycleThreadTerminal";
import { confirmTerminalClose } from "../../lib/terminalCloseConfirm";
import { findReusableProjectScriptTerminal } from "../../lib/projectScriptTerminal";
import { closingTerminalIds } from "../terminal/closingTerminals";
import { type TerminalContextSelection } from "../../lib/terminalContext";
import { focusActiveTerminal, focusTerminal } from "../../lib/terminalFocus";
import { useTerminalUiStateStore } from "../../terminalUiStateStore";
import {
  LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
  LastInvokedScriptByProjectSchema,
  makeThreadErrorSetter,
} from "../ChatView.logic";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { previewEnvironment } from "../../state/preview";
import { readEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import type { ChatShortcutCommands } from "./useChatShortcuts";
const SCRIPT_TERMINAL_COLS = 120;
const SCRIPT_TERMINAL_ROWS = 30;

export interface TerminalLaunchContext {
  threadId: ThreadId;
  cwd: string;
  worktreePath: string | null;
}

interface ChatTerminalActionsInput {
  readonly environmentId: EnvironmentId;
  readonly composerRef: ComposerHandleRef;
  readonly terminalUiState: ReturnType<typeof selectThreadTerminalUiState>;
  readonly activeThread: EnvironmentThreadShell | undefined;
  readonly activeThreadId: ThreadId | null;
  readonly activeThreadRef: ScopedThreadRef | null;
  readonly activeProject: EnvironmentProject | null;
  /** The terminal pane is on screen. */
  readonly terminalOpen: boolean;
  /** The terminal pane floats as a small window over the chat. */
  readonly terminalFloating: boolean;
  readonly runningTerminalIds: ReadonlyArray<string>;
  readonly activeServerOrderedTerminalIds: ReadonlyArray<string>;
  readonly activeTerminalLabelsById: ReadonlyMap<string, string>;
  readonly canReuseTerminal: boolean;
  readonly gitCwd: string | null;
  readonly setTerminalUiLaunchContext: Dispatch<SetStateAction<TerminalLaunchContext | null>>;
  readonly setThreadError: ReturnType<typeof makeThreadErrorSetter>;
}

/**
 * The thread's terminals in the terminal pane, and project scripts and chat code blocks, which
 * run in a reused or new terminal there.
 */
export function useChatTerminalActions(input: ChatTerminalActionsInput) {
  const {
    environmentId,
    composerRef,
    terminalUiState,
    activeThread,
    activeThreadId,
    activeThreadRef,
    activeProject,
    terminalOpen,
    terminalFloating,
    runningTerminalIds,
    activeServerOrderedTerminalIds,
    activeTerminalLabelsById,
    canReuseTerminal,
    gitCwd,
    setTerminalUiLaunchContext,
    setThreadError,
  } = input;
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });

  const hasTerminalWriteAccess = () =>
    readEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const [lastInvokedScriptByProjectId, setLastInvokedScriptByProjectId] = useLocalStorage(
    LAST_INVOKED_SCRIPT_BY_PROJECT_KEY,
    {},
    LastInvokedScriptByProjectSchema,
  );
  const storeEnsureTerminal = useTerminalUiStateStore((state) => state.ensureTerminal);
  const storeSplitTerminal = useTerminalUiStateStore((s) => s.splitTerminal);
  const storeSplitTerminalVertical = useTerminalUiStateStore((s) => s.splitTerminalVertical);
  const storeNewTerminal = useTerminalUiStateStore((s) => s.newTerminal);
  const storeCloseTerminal = useTerminalUiStateStore((s) => s.closeTerminal);
  const terminalActions = useThreadTerminalActions(activeThreadRef);

  const activeTerminalGroup =
    terminalUiState.terminalGroups.find(
      (group) => group.id === terminalUiState.activeTerminalGroupId,
    ) ??
    terminalUiState.terminalGroups.find((group) =>
      group.terminalIds.includes(terminalUiState.activeTerminalId),
    ) ??
    null;
  const hasReachedSplitLimit =
    (activeTerminalGroup?.terminalIds.length ?? 0) >= MAX_TERMINALS_PER_GROUP;
  /*__HOOK__*/
  const addTerminalContextToDraft = (selection: TerminalContextSelection) => {
    composerRef.current?.addTerminalContext(selection);
  };
  const addTerminalContextToDraftStable = useStableCallback(addTerminalContextToDraft);
  /**
   * Shows the terminal pane, placing it where it last sat or by the default placement. A pane
   * already on screen, tiled or floating, stays as it is.
   */
  const showTerminalPane = () => {
    if (!activeThreadRef || terminalOpen || terminalFloating) return;
    useRightPanelStore.getState().open(activeThreadRef, "terminal");
  };
  const toggleTerminalVisibility = () => {
    if (!activeThreadRef) return;
    if (terminalOpen) {
      useRightPanelStore.getState().hidePane(activeThreadRef, "terminal");
      return;
    }
    if (!readEnvironmentScope(environmentId, AuthTerminalReadScope) && !hasTerminalWriteAccess())
      return;
    if (hasTerminalWriteAccess() && terminalUiState.terminalIds.length === 0) {
      // Server-created setup terminals exist before this client's pane mounts.
      // Reuse them before allocating a shell from the still-empty UI state.
      // The server lists a closing terminal until its close finishes, which would end the reopen.
      const closingIds = new Set(closingTerminalIds(activeThreadRef));
      const isReusable = (id: string) => !closingIds.has(id);
      const existingTerminalId =
        runningTerminalIds.find(isReusable) ?? activeServerOrderedTerminalIds.find(isReusable);
      if (existingTerminalId !== undefined) {
        storeEnsureTerminal(activeThreadRef, existingTerminalId, { active: true });
      } else {
        void terminalActions.launchTerminal({
          place: (terminalId) => storeEnsureTerminal(activeThreadRef, terminalId),
        })?.result;
      }
    }
    // A floating terminal comes back into the layout.
    useRightPanelStore.getState().open(activeThreadRef, "terminal");
    focusActiveTerminal(activeThreadRef);
  };
  const toggleTerminalVisibilityStable = useStableCallback(toggleTerminalVisibility);
  const splitTerminal = (direction: "horizontal" | "vertical" = "horizontal") => {
    if (!activeThreadRef || hasReachedSplitLimit) return;
    showTerminalPane();
    const launched = terminalActions.launchTerminal({
      place: (terminalId) =>
        direction === "vertical"
          ? storeSplitTerminalVertical(activeThreadRef, terminalId)
          : storeSplitTerminal(activeThreadRef, terminalId),
    });
    if (!launched) return;
    focusTerminal(activeThreadRef, launched.terminalId);
    void launched.result;
  };
  const splitTerminalStable = useStableCallback(splitTerminal);
  const createNewTerminal = () => {
    if (!activeThreadRef) return;
    showTerminalPane();
    const launched = terminalActions.launchTerminal({
      place: (terminalId) => storeNewTerminal(activeThreadRef, terminalId),
    });
    if (!launched) return;
    focusTerminal(activeThreadRef, launched.terminalId);
    void launched.result;
  };
  const createNewTerminalStable = useStableCallback(createNewTerminal);
  const closeTerminal = (terminalId: string) => {
    if (!hasTerminalWriteAccess() || !activeThreadRef) return;
    terminalActions.closeTerminalSession(terminalId, activeThreadRef);
    storeCloseTerminal(activeThreadRef, terminalId);
    focusActiveTerminal(activeThreadRef);
  };
  const runProjectScript = async (
    script: ProjectScript,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      worktreePath?: string | null;
      preferNewTerminal?: boolean;
      rememberAsLastInvoked?: boolean;
      shellHistory?: "preserve" | "suppress";
    },
  ) => {
    if (!hasTerminalWriteAccess() || !activeThreadId || !activeProject || !activeThread) return;
    if (options?.rememberAsLastInvoked !== false) {
      setLastInvokedScriptByProjectId((current) => {
        if (current[activeProject.id] === script.id) return current;
        return { ...current, [activeProject.id]: script.id };
      });
    }
    const targetCwd = options?.cwd ?? gitCwd ?? activeProject.workspaceRoot;
    const reusableTerminalId =
      script.stopOnSettle ||
      options?.preferNewTerminal ||
      !canReuseTerminal ||
      !readEnvironmentScope(environmentId, AuthTerminalReadScope)
        ? null
        : findReusableProjectScriptTerminal({
            // Server sessions cover terminals this client has not opened yet, such as a
            // worktree setup shell.
            terminalIds: [
              ...new Set([...terminalUiState.terminalIds, ...activeServerOrderedTerminalIds]),
            ],
            activeTerminalId: terminalUiState.activeTerminalId,
            runningTerminalIds,
            closingTerminalIds: activeThreadRef ? closingTerminalIds(activeThreadRef) : [],
          });
    const targetWorktreePath = options?.worktreePath ?? activeThread.worktreePath ?? null;

    setTerminalUiLaunchContext({
      threadId: activeThreadId,
      cwd: targetCwd,
      worktreePath: targetWorktreePath,
    });
    if (!activeThreadRef) {
      return;
    }

    showTerminalPane();
    const launched = terminalActions.launchTerminal({
      place: (terminalId) =>
        reusableTerminalId === null
          ? storeNewTerminal(activeThreadRef, terminalId)
          : storeEnsureTerminal(activeThreadRef, terminalId),
      ...(reusableTerminalId === null
        ? { size: { cols: SCRIPT_TERMINAL_COLS, rows: SCRIPT_TERMINAL_ROWS } }
        : { terminalId: reusableTerminalId }),
      location: { cwd: targetCwd, worktreePath: targetWorktreePath },
      stopOnSettle: script.stopOnSettle ?? false,
      ...(options?.env ? { extraEnv: options.env } : {}),
    });
    if (!launched) return;
    const targetTerminalId = launched.terminalId;
    focusTerminal(activeThreadRef, targetTerminalId);
    const openResult = await launched.result;
    if (openResult._tag === "Failure") {
      if (!isAtomCommandInterrupted(openResult)) {
        const error = squashAtomCommandFailure(openResult);
        setThreadError(
          activeThreadId,
          thrownErrorMessage(error, m) ??
            m(msg('Failed to run script "{name}".', { name: script.name })),
        );
      }
      return;
    }

    const writeResult = await terminalActions.writeToTerminal(
      targetTerminalId,
      options?.shellHistory === "preserve"
        ? `${script.command}\r`
        : projectScriptTerminalInput(script.command),
    );
    if (!writeResult) return;
    if (writeResult._tag === "Failure") {
      if (!isAtomCommandInterrupted(writeResult)) {
        const error = squashAtomCommandFailure(writeResult);
        setThreadError(
          activeThreadId,
          thrownErrorMessage(error, m) ??
            m(msg('Failed to run script "{name}".', { name: script.name })),
        );
      }
      return;
    }
    if (
      script.autoOpenPreview &&
      script.previewUrl &&
      isPreviewAvailableFor(activeThreadRef.environmentId)
    ) {
      const previewResult = await openUrlInPreview({
        threadRef: activeThreadRef,
        url: resolveDiscoveredServerUrl(activeThreadRef.environmentId, script.previewUrl),
        openPreview,
      });
      if (previewResult._tag === "Failure" && !isAtomCommandInterrupted(previewResult)) {
        const error = squashAtomCommandFailure(previewResult);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: m(msg("Could not open preview")),
            description: thrownErrorMessage(error, m) ?? m(msg("An unexpected error occurred.")),
          }),
        );
      }
    }
  };
  const runProjectScriptStable = useStableCallback(runProjectScript);

  const runShellCommand = (command: string) => {
    void runProjectScript(
      {
        id: "chat-code-block",
        name: m(msg("Chat code block")),
        command,
        icon: "play",
        runOnWorktreeCreate: false,
      },
      { rememberAsLastInvoked: false, shellHistory: "preserve" },
    );
  };
  const runShellCommandStable = useStableCallback(runShellCommand);
  const requestCloseTerminal = (terminalId: string) => {
    if (!hasTerminalWriteAccess()) return;
    const label = activeTerminalLabelsById.get(terminalId) ?? getTerminalLabel(terminalId, m);
    void confirmTerminalClose([label]).then((confirmed) => {
      if (confirmed && readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
        closeTerminal(terminalId);
      }
    });
  };
  const requestCloseTerminalStable = useStableCallback(requestCloseTerminal);
  const shortcuts = {
    "terminal.toggle": () => {
      if (
        !terminalOpen &&
        !readEnvironmentScope(environmentId, AuthTerminalReadScope) &&
        !hasTerminalWriteAccess()
      )
        return false;
      toggleTerminalVisibility();
    },
    "terminal.previous": ({ terminalFocused }) => {
      if (!activeThreadRef || !terminalFocused) return false;
      return cycleThreadTerminal(activeThreadRef, "previous");
    },
    "terminal.next": ({ terminalFocused }) => {
      if (!activeThreadRef || !terminalFocused) return false;
      return cycleThreadTerminal(activeThreadRef, "next");
    },
    "terminal.split": () => {
      if (!hasTerminalWriteAccess()) return false;
      splitTerminal();
    },
    "terminal.splitVertical": () => {
      if (!hasTerminalWriteAccess()) return false;
      splitTerminal("vertical");
    },
    "terminal.close": ({ terminalFocused }) => {
      if (!hasTerminalWriteAccess()) return false;
      // A focused terminal is on screen even when its pane floats rather than tiles.
      if (terminalOpen || terminalFocused) requestCloseTerminal(terminalUiState.activeTerminalId);
    },
    "terminal.new": () => {
      if (!hasTerminalWriteAccess()) return false;
      createNewTerminal();
    },
  } satisfies ChatShortcutCommands;
  return {
    shortcuts,
    addTerminalContextToDraftStable,
    createNewTerminalStable,
    lastInvokedScriptByProjectId,
    requestCloseTerminalStable,
    runProjectScriptStable,
    runShellCommandStable,
    splitTerminalStable,
    toggleTerminalVisibilityStable,
  };
}
