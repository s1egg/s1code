import { describe, expect, it } from "vite-plus/test";

import { findReusableProjectScriptTerminal } from "./projectScriptTerminal";

describe("findReusableProjectScriptTerminal", () => {
  it.each([
    {
      name: "reuses the active idle terminal",
      terminalIds: ["term-1", "term-2"],
      activeTerminalId: "term-2",
      runningTerminalIds: [],
      expected: "term-2",
    },
    {
      name: "falls back to another idle terminal when the active one is busy",
      terminalIds: ["term-1", "term-2"],
      activeTerminalId: "term-1",
      runningTerminalIds: ["term-1"],
      expected: "term-2",
    },
    {
      name: "finds nothing when every terminal is busy",
      terminalIds: ["term-1"],
      activeTerminalId: "term-1",
      runningTerminalIds: ["term-1"],
      expected: null,
    },
    {
      name: "skips an idle terminal whose close is still pending",
      terminalIds: ["term-1"],
      activeTerminalId: "term-1",
      runningTerminalIds: [],
      closingTerminalIds: ["term-1"],
      expected: null,
    },
  ])("$name", ({ closingTerminalIds = [], expected, ...input }) => {
    expect(findReusableProjectScriptTerminal({ ...input, closingTerminalIds })).toBe(expected);
  });
});
