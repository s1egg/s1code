import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@s1tools/contracts";
import { expect, it } from "vite-plus/test";

import { useRightPanelStore } from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { cycleThreadTerminal } from "./cycleThreadTerminal";
import { registerTerminalFocusTarget } from "./terminalFocus";

function setup() {
  useTerminalUiStateStore.setState({
    terminalUiStateByThreadKey: {},
    suppressedTerminalIdsByThreadKey: {},
    serverObservationsByThreadKey: {},
  });
  useRightPanelStore.setState({ byThreadKey: {} });
  return scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("cycle"));
}

it("cycles terminals and split panes in display order, wraps both ways, and focuses the target", () => {
  const ref = setup();
  const terminals = useTerminalUiStateStore.getState();
  terminals.newTerminal(ref, "a");
  terminals.newTerminal(ref, "b");
  terminals.setActiveTerminal(ref, "a");
  terminals.splitTerminal(ref, "c");
  terminals.newTerminal(ref, "z");
  terminals.reconcileTerminalIds(ref, ["z", "c", "b", "a"]);
  useRightPanelStore.getState().open(ref, "terminal");
  let focused: string | null = null;
  const unregister = ["a", "c", "b", "z"].map((terminalId) =>
    registerTerminalFocusTarget({
      threadRef: ref,
      terminalId,
      focus: () => {
        focused = terminalId;
        return true;
      },
    }),
  );
  try {
    terminals.setActiveTerminal(ref, "a");
    for (const expected of ["c", "b", "z", "a"]) {
      expect(cycleThreadTerminal(ref, "next")).toBe(true);
      expect(
        selectThreadTerminalUiState(
          useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
          ref,
        ).activeTerminalId,
      ).toBe(expected);
      expect(focused).toBe(expected);
    }
    cycleThreadTerminal(ref, "previous");
    expect(focused).toBe("z");
    const remoteRef = scopeThreadRef(EnvironmentId.make("remote"), ref.threadId);
    expect(cycleThreadTerminal(remoteRef, "next")).toBe(false);
    useRightPanelStore.getState().hidePane(ref, "terminal");
    expect(cycleThreadTerminal(ref, "next")).toBe(false);
  } finally {
    for (const dispose of unregister) dispose();
  }
});
