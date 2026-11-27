import { scopedThreadKey } from "@s1tools/client-runtime/environment";
import type { ScopedThreadRef } from "@s1tools/contracts";

import {
  selectActiveRightPanelSurface,
  selectPaneVisible,
  useRightPanelStore,
} from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";

export function isTerminalFocused(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !activeElement.isConnected) return false;
  return activeElement.closest("[data-thread-terminal-drawer]") !== null;
}

export function subscribeToTerminalFocusChanges(listener: () => void): () => void {
  window.addEventListener("focusin", listener, true);
  window.addEventListener("focusout", listener, true);
  return () => {
    window.removeEventListener("focusin", listener, true);
    window.removeEventListener("focusout", listener, true);
  };
}

interface TerminalFocusTarget {
  readonly threadRef: ScopedThreadRef;
  readonly terminalId: string;
  readonly element?: HTMLElement;
  /** Returns false when the target cannot take focus yet (hidden, or no operate grant). */
  readonly focus: () => boolean;
}

const focusTargets = new Set<TerminalFocusTarget>();
const lastThreadFocus = new Map<string, "composer" | { terminalId: string }>();
// One request at a time: the newest terminal the user asked for wins, so an
// older request never fires later and steals focus.
let pendingFocus: { readonly threadKey: string; readonly terminalId: string } | null = null;
// The thread ChatView currently shows, and the thread a navigating handler
// asked to focus a terminal in. The mark outlives `pendingFocus`: the new
// thread's viewports mount and consume the handler's request in the commit's
// layout phase, before ChatView's thread-enter effect runs.
let enteredThreadKey: string | null = null;
// Pane visibility reruns reuse the root; a remounted chat must not inherit parked requests.
const lastEnteredThreadByRoot = new WeakMap<HTMLElement, string>();
let navigationRequestThreadKey: string | null = null;

function isPending(threadKey: string, terminalId: string): boolean {
  return pendingFocus?.threadKey === threadKey && pendingFocus.terminalId === terminalId;
}

function focusMountedTarget(threadKey: string, terminalId: string): boolean {
  for (const target of focusTargets) {
    if (
      target.terminalId === terminalId &&
      scopedThreadKey(target.threadRef) === threadKey &&
      target.focus()
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Focuses a thread's terminal when its viewport can take focus, or once it can.
 * Opening, creating or switching to a terminal usually mounts or shows its
 * viewport after the handler returns, so the request waits for the viewport.
 */
export function focusTerminal(threadRef: ScopedThreadRef, terminalId: string): void {
  const threadKey = scopedThreadKey(threadRef);
  pendingFocus = focusMountedTarget(threadKey, terminalId) ? null : { threadKey, terminalId };
}

/**
 * Focuses the terminal the store marks active while the terminal pane is on screen, after an
 * open, close or switch. A thread whose pane ended up hidden drops its waiting request.
 */
export function focusActiveTerminal(threadRef: ScopedThreadRef): void {
  const { activeTerminalId } = selectThreadTerminalUiState(
    useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
    threadRef,
  );
  const visible = selectPaneVisible(
    useRightPanelStore.getState().byThreadKey,
    threadRef,
    "terminal",
  );
  if (visible && activeTerminalId) focusTerminal(threadRef, activeTerminalId);
  else cancelTerminalFocus(threadRef);
}

/** After a pane item closes, focuses the terminal when focus fell back to the terminal pane. */
export function focusTerminalAfterClose(
  threadRef: ScopedThreadRef,
  previousActiveSurfaceId: string | null,
): void {
  const surface = selectActiveRightPanelSurface(
    useRightPanelStore.getState().byThreadKey,
    threadRef,
  );
  if (surface?.kind === "terminal" && surface.id !== previousActiveSurfaceId) {
    focusActiveTerminal(threadRef);
  }
}

/**
 * Focuses a terminal from a handler that may also navigate to its thread (a
 * sidebar terminal reveal). When it does, that thread's entry keeps this request
 * instead of restoring its last focus.
 */
export function focusTerminalOnNavigation(threadRef: ScopedThreadRef, terminalId: string): void {
  const threadKey = scopedThreadKey(threadRef);
  navigationRequestThreadKey = threadKey === enteredThreadKey ? null : threadKey;
  focusTerminal(threadRef, terminalId);
}

/** Restores composer or terminal focus; explicit terminal navigation takes precedence. */
export function restoreFocusOnThreadEnter(
  threadRef: ScopedThreadRef,
  content: { readonly root: HTMLElement; readonly focusComposer: () => void },
): () => void {
  const threadKey = scopedThreadKey(threadRef);
  const requestedByHandler =
    navigationRequestThreadKey === threadKey ||
    (lastEnteredThreadByRoot.get(content.root) === threadKey &&
      pendingFocus?.threadKey === threadKey);
  if (!requestedByHandler) pendingFocus = null;
  lastEnteredThreadByRoot.set(content.root, threadKey);
  navigationRequestThreadKey = null;
  enteredThreadKey = threadKey;
  const previous = lastThreadFocus.get(threadKey);
  const remember = () => {
    const element = content.root.ownerDocument.activeElement;
    if (!element) return;
    const terminal = Array.from(focusTargets).find((target) => target.element?.contains(element));
    if (terminal) {
      if (scopedThreadKey(terminal.threadRef) === threadKey)
        lastThreadFocus.set(threadKey, { terminalId: terminal.terminalId });
    } else if (
      content.root.contains(element) &&
      element.closest('[data-workspace-area="composer"]')
    ) {
      lastThreadFocus.set(threadKey, "composer");
    }
  };
  content.root.ownerDocument.addEventListener("focusin", remember);
  if (!requestedByHandler) {
    const terminals = selectThreadTerminalUiState(
      useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
      threadRef,
    );
    const paneVisible = selectPaneVisible(
      useRightPanelStore.getState().byThreadKey,
      threadRef,
      "terminal",
    );
    if (previous === "composer") {
      content.focusComposer();
    } else if (
      previous &&
      paneVisible &&
      terminals.terminalGroups
        .find((group) => group.id === terminals.activeTerminalGroupId)
        ?.terminalIds.includes(previous.terminalId)
    ) {
      focusTerminal(threadRef, previous.terminalId);
    } else if (paneVisible && terminals.activeTerminalId) {
      focusTerminal(threadRef, terminals.activeTerminalId);
    } else content.focusComposer();
  }
  if (requestedByHandler) remember();
  return () => {
    content.root.ownerDocument.removeEventListener("focusin", remember);
    // A handler navigating elsewhere marks its target before this cleanup runs.
    if (enteredThreadKey === threadKey) enteredThreadKey = null;
  };
}

function cancelTerminalFocus(threadRef: ScopedThreadRef): void {
  if (pendingFocus?.threadKey === scopedThreadKey(threadRef)) pendingFocus = null;
}

/**
 * Retries a waiting request once a mounted viewport can take it: when it is
 * shown (a viewport kept mounted while hidden has `display: none`) or when the
 * operate grant arrives. Neither ever invents a request.
 */
export function consumePendingTerminalFocus(threadRef: ScopedThreadRef, terminalId: string): void {
  const threadKey = scopedThreadKey(threadRef);
  if (isPending(threadKey, terminalId) && focusMountedTarget(threadKey, terminalId)) {
    pendingFocus = null;
  }
}

export function registerTerminalFocusTarget(target: TerminalFocusTarget): () => void {
  focusTargets.add(target);
  if (isPending(scopedThreadKey(target.threadRef), target.terminalId) && target.focus()) {
    pendingFocus = null;
  }
  return () => {
    focusTargets.delete(target);
  };
}

/**
 * A viewport's `focus` for its target. Focus lands on the mount until the
 * surface exists, and the surface takes it over from there.
 */
export function focusTerminalViewport(input: {
  readonly mount: HTMLElement;
  readonly surface: { focus(): void } | null;
  readonly canOperate: boolean;
  readonly visible: boolean;
}): boolean {
  // A hidden terminal can be clipped, not display:none: the mount would take focus
  // while the surface refuses it, and the request would be spent on a wrapper
  // that ignores typing.
  if (!input.canOperate || !input.visible) return false;
  input.mount.focus({ preventScroll: true });
  input.surface?.focus();
  return input.mount.contains(document.activeElement);
}
