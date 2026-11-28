import type { ScopedThreadRef } from "@s1tools/contracts";

import { selectPaneOnScreen, useRightPanelStore } from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { focusTerminal } from "./terminalFocus";

/** Steps to the previous or next terminal of the pane, in its sidebar's order. */
export function cycleThreadTerminal(
  threadRef: ScopedThreadRef,
  direction: "previous" | "next",
): boolean {
  const store = useTerminalUiStateStore.getState();
  const state = selectThreadTerminalUiState(store.terminalUiStateByThreadKey, threadRef);
  if (!selectPaneOnScreen(useRightPanelStore.getState().byThreadKey, threadRef, "terminal")) {
    return false;
  }
  const terminalOrder = new Map(state.terminalIds.map((id, index) => [id, index]));
  const groupRank = (ids: readonly string[]) =>
    Math.min(...ids.map((id) => terminalOrder.get(id) ?? Number.POSITIVE_INFINITY));
  const terminalIds = state.terminalGroups
    .toSorted((left, right) => groupRank(left.terminalIds) - groupRank(right.terminalIds))
    .flatMap((group) => group.terminalIds);
  const index = terminalIds.indexOf(state.activeTerminalId);
  if (index === -1) return false;
  const offset = direction === "next" ? 1 : -1;
  const terminalId = terminalIds[(index + offset + terminalIds.length) % terminalIds.length];
  if (terminalId === undefined) return false;
  store.setActiveTerminal(threadRef, terminalId);
  focusTerminal(threadRef, terminalId);
  return true;
}
