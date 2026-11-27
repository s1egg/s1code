import { toServerClock } from "@s1tools/client-runtime/clock";
import type { EnvironmentId } from "@s1tools/contracts";
import { formatDuration } from "@s1tools/shared/orchestrationTimingCopy";
import { msg } from "gt-react";
import { m, type MessageResolver } from "~/i18n/messages";

/** A finished island's visible summary: how the turn ended and, when known, how long it worked. */
export function turnIslandSummary(
  outcome: "interrupted" | "failed" | undefined,
  duration: string | null,
  resolve: MessageResolver = m,
): string {
  if (outcome === "interrupted") {
    return resolve(
      duration === null
        ? msg("Stopped", { $context: "a turn the user stopped, as its folded summary" })
        : msg("Stopped {duration}", {
            duration,
            $context:
              "a turn the user stopped: the word Stopped, then how long the agent worked, such as 5.2s",
          }),
    );
  }
  if (outcome === "failed") {
    return resolve(
      duration === null
        ? msg("Failed", { $context: "a turn that failed, as its folded summary" })
        : msg("Failed {duration}", {
            duration,
            $context:
              "a turn that failed: the word Failed, then how long the agent worked, such as 1m 12s",
          }),
    );
  }
  return resolve(
    duration === null
      ? msg("Work", { $context: "a finished turn whose duration is unknown, as its summary" })
      : msg("Work {duration}", {
          duration,
          $context: "a finished turn: the word Work, then how long the agent worked, such as 5.2s",
        }),
  );
}

export function formatWorkingTimerNow(startIso: string, environmentId: EnvironmentId): string {
  const startedAtMs = Date.parse(startIso);
  if (!Number.isFinite(startedAtMs)) {
    return m(msg("{seconds}s", { seconds: 0 }));
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((toServerClock(environmentId, Date.now()) - startedAtMs) / 1000),
  );
  if (elapsedSeconds < 60) {
    return m(msg("{seconds}s", { seconds: elapsedSeconds }));
  }

  return formatDuration(elapsedSeconds * 1_000, m);
}

/** A running turn's clock: "m:ss", or "h:mm:ss" from an hour. */
export function formatTurnClock(elapsedMs: number): string {
  const total = Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * How a running island's state may replace the one it shows: once the shown one has had its
 * minimum time, once that has passed and it settled (Thinking, which flickers between tool calls),
 * or at once.
 */
export type IslandHold = "normal" | "settle" | "immediate";

export const MIN_SHOW_MS = 1_000;
export const THINK_SETTLE_MS = 600;

interface HeldLook {
  readonly key: string;
  readonly hold: IslandHold;
}

export interface IslandHoldState<Look extends HeldLook> {
  readonly shown: Look;
  readonly wanted: Look;
  /** The shown state has had its minimum time. */
  readonly minShown: boolean;
  /** The wanted state has been wanted for its settle time. */
  readonly settled: boolean;
}

export function showIslandLook<Look extends HeldLook>(look: Look): IslandHoldState<Look> {
  return { shown: look, wanted: look, minShown: false, settled: false };
}

/** Whether the wanted state may replace the shown one now. */
export function islandShowsWanted<Look extends HeldLook>(state: IslandHoldState<Look>): boolean {
  if (state.wanted.key === state.shown.key) return false;
  if (state.wanted.hold === "immediate") return true;
  return state.minShown && (state.wanted.hold === "normal" || state.settled);
}

/**
 * Takes the look the island wants, showing it when its hold allows. Returns the same state while
 * nothing changes, so it can run on every render; the first look always shows. A look for the
 * shown state replaces its fields in place and keeps its hold.
 */
export function advanceIslandHold<Look extends HeldLook>(
  state: IslandHoldState<Look> | null,
  look: Look,
  sameLook: (a: Look, b: Look) => boolean,
): IslandHoldState<Look> {
  if (state === null) return showIslandLook(look);
  if (look.key === state.shown.key) {
    return state.wanted === state.shown && sameLook(look, state.shown)
      ? state
      : { ...state, shown: look, wanted: look, settled: false };
  }
  const next = look.key === state.wanted.key ? state : { ...state, wanted: look, settled: false };
  return islandShowsWanted(next) ? showIslandLook(next.wanted) : next;
}
