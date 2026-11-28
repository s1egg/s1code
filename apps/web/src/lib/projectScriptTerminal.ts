/** Project actions reuse only an idle terminal of the thread, the active one first. */
export function findReusableProjectScriptTerminal(input: {
  readonly terminalIds: ReadonlyArray<string>;
  readonly activeTerminalId: string;
  readonly runningTerminalIds: ReadonlyArray<string>;
  /** A pending close would end the script's shell once the reopen runs. */
  readonly closingTerminalIds: ReadonlyArray<string>;
}): string | null {
  const idleTerminalIds = input.terminalIds.filter(
    (terminalId) =>
      !input.runningTerminalIds.includes(terminalId) &&
      !input.closingTerminalIds.includes(terminalId),
  );
  if (idleTerminalIds.includes(input.activeTerminalId)) return input.activeTerminalId;
  return idleTerminalIds[0] ?? null;
}
