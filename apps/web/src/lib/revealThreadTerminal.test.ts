import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@s1tools/contracts";
import { beforeEach, expect, it } from "vite-plus/test";

import { selectPaneVisible, useRightPanelStore } from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { revealThreadTerminal } from "./revealThreadTerminal";

const threadRef = scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("settled-thread"));
const remoteRef = scopeThreadRef(EnvironmentId.make("remote"), threadRef.threadId);

beforeEach(() => {
  useTerminalUiStateStore.setState({
    terminalUiStateByThreadKey: {},
    suppressedTerminalIdsByThreadKey: {},
  });
  useRightPanelStore.setState({ byThreadKey: {} });
});

it("shows the hidden terminal pane where it sat and selects the running terminal", () => {
  const terminals = useTerminalUiStateStore.getState();
  terminals.newTerminal(threadRef, "terminal-1");
  terminals.splitTerminal(threadRef, "setup-install");
  terminals.setActiveTerminal(threadRef, "terminal-1");
  const panels = useRightPanelStore.getState();
  panels.open(threadRef, "terminal");
  panels.movePane(threadRef, "terminal", "chat", "bottom");
  panels.hidePane(threadRef, "terminal");

  revealThreadTerminal(threadRef, "setup-install");
  const byThreadKey = useRightPanelStore.getState().byThreadKey;
  expect(selectPaneVisible(byThreadKey, threadRef, "terminal")).toBe(true);
  expect(byThreadKey[Object.keys(byThreadKey)[0]!]!.layout).toMatchObject({
    direction: "column",
    children: [{ type: "chat" }, { type: "pane", pane: "terminal" }],
  });
  expect(
    selectThreadTerminalUiState(
      useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
      threadRef,
    ),
  ).toMatchObject({
    terminalIds: ["terminal-1", "setup-install"],
    activeTerminalId: "setup-install",
  });
});

it("reveals terminals in their own environment without changing another environment's", () => {
  revealThreadTerminal(threadRef, "default");
  revealThreadTerminal(remoteRef, "setup-install");
  const state = useTerminalUiStateStore.getState().terminalUiStateByThreadKey;
  expect(selectThreadTerminalUiState(state, threadRef).terminalIds).toEqual(["default"]);
  expect(selectThreadTerminalUiState(state, remoteRef).terminalIds).toEqual(["setup-install"]);
});
