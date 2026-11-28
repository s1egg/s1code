import type { ScopedThreadRef } from "@s1tools/contracts";

import { useRightPanelStore } from "../rightPanelStore";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { focusTerminalOnNavigation } from "./terminalFocus";

export function revealThreadTerminal(threadRef: ScopedThreadRef, terminalId: string) {
  useTerminalUiStateStore.getState().ensureTerminal(threadRef, terminalId, { active: true });
  useRightPanelStore.getState().open(threadRef, "terminal");
  focusTerminalOnNavigation(threadRef, terminalId);
}
