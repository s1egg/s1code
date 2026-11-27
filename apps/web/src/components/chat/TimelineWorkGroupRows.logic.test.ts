import { describe, expect, it } from "vite-plus/test";
import {
  advanceIslandHold,
  islandShowsWanted,
  MIN_SHOW_MS,
  THINK_SETTLE_MS,
  turnIslandSummary,
  type IslandHold,
  type IslandHoldState,
} from "./TimelineWorkGroupRows.logic";

interface Look {
  readonly key: string;
  readonly hold: IslandHold;
  readonly label?: string;
}

const holdOf = (key: string): IslandHold =>
  key === "thinking"
    ? "settle"
    : key === "approval" || key === "subagents" || key === "compacting"
      ? "immediate"
      : "normal";
const look = (key: string, label?: string): Look => ({
  key,
  hold: holdOf(key),
  ...(label === undefined ? {} : { label }),
});
const sameLook = (a: Look, b: Look) => a.key === b.key && a.label === b.label;

/**
 * Replays wanted looks the way the island's hook does: a minimum-time timer per shown state, a
 * settle timer per wanted Thinking, and nothing more once the turn ends.
 */
function replay(requests: ReadonlyArray<readonly [number, Look]>, endsAt = Infinity) {
  let state: IslandHoldState<Look> | null = null;
  let shownAt = 0;
  let wantedSince = 0;
  const shown: Array<[number, string]> = [];
  const render = (time: number, next: IslandHoldState<Look>) => {
    if (next.shown.key !== state?.shown.key) {
      shownAt = time;
      shown.push([time, next.shown.key]);
    }
    if (next.wanted.key !== state?.wanted.key) wantedSince = time;
    state = next;
  };
  const nextTimer = (current: IslandHoldState<Look>) => {
    const timers: Array<{ at: number; fire: () => IslandHoldState<Look> }> = [];
    if (!current.minShown) {
      timers.push({ at: shownAt + MIN_SHOW_MS, fire: () => ({ ...current, minShown: true }) });
    }
    if (
      current.wanted.hold === "settle" &&
      current.wanted.key !== current.shown.key &&
      !current.settled
    ) {
      timers.push({
        at: wantedSince + THINK_SETTLE_MS,
        fire: () => ({ ...current, settled: true }),
      });
    }
    return timers.toSorted((a, b) => a.at - b.at)[0];
  };
  const runTimersBefore = (time: number, inclusive: boolean) => {
    for (;;) {
      if (state === null) return;
      const timer = nextTimer(state);
      if (!timer || (inclusive ? timer.at > time : timer.at >= time)) return;
      const fired = timer.fire();
      render(timer.at, advanceIslandHold(fired, fired.wanted, sameLook));
    }
  };
  for (const [time, wanted] of requests) {
    runTimersBefore(time, true);
    render(time, advanceIslandHold(state, wanted, sameLook));
  }
  runTimersBefore(endsAt, false);
  return { shown, state: state as IslandHoldState<Look> | null };
}

describe("island hold", () => {
  it("shows the approved sequence", () => {
    const requests = [
      [0, "thinking"],
      [1100, "tool:web"],
      [1800, "tool:explore"],
      [2100, "tool:explore"],
      [2400, "tool:explore"],
      [2700, "tool:explore"],
      [3000, "thinking"],
      [3250, "tool:edit"],
      [3800, "tool:edit"],
      [4300, "tool:edit"],
      [4900, "tool:run"],
      [6300, "thinking"],
      [7300, "tool:edit"],
      [7750, "tool:run"],
      [8700, "writing"],
    ] as const;
    const { shown } = replay(
      requests.map(([time, key]) => [time, look(key)] as const),
      9400,
    );
    expect(shown).toEqual([
      [0, "thinking"],
      [1100, "tool:web"],
      [2100, "tool:explore"],
      [3250, "tool:edit"],
      [4900, "tool:run"],
      [6900, "thinking"],
      [7900, "tool:run"],
      [8900, "writing"],
    ]);
  });

  it("shows Thinking only once it has been wanted continuously for its settle time", () => {
    // Wanted at 1500, past the minimum time: it still waits for its settle.
    expect(
      replay([
        [0, look("tool:edit")],
        [1500, look("thinking")],
      ]).shown,
    ).toEqual([
      [0, "tool:edit"],
      [2100, "thinking"],
    ]);
    // A tool in between restarts the settle.
    expect(
      replay([
        [0, look("tool:edit")],
        [1500, look("thinking")],
        [1800, look("tool:edit")],
        [1900, look("thinking")],
      ]).shown,
    ).toEqual([
      [0, "tool:edit"],
      [2500, "thinking"],
    ]);
  });

  it("shows the first state at once, Thinking included", () => {
    expect(replay([[500, look("thinking")]]).shown).toEqual([[500, "thinking"]]);
  });

  it("shows waiting and compacting states at once", () => {
    expect(
      replay([
        [0, look("thinking")],
        [100, look("approval")],
        [150, look("subagents")],
        [200, look("compacting")],
      ]).shown,
    ).toEqual([
      [0, "thinking"],
      [100, "approval"],
      [150, "subagents"],
      [200, "compacting"],
    ]);
  });

  it("updates the shown state in place without resetting its hold", () => {
    const shownState = advanceIslandHold(null, look("subagents", "Waiting on 2 agents"), sameLook);
    const updated = advanceIslandHold(
      shownState,
      look("subagents", "Waiting on 1 agent"),
      sameLook,
    );
    expect(updated.shown.label).toBe("Waiting on 1 agent");
    expect(updated.minShown).toBe(shownState.minShown);
    expect(advanceIslandHold(updated, look("subagents", "Waiting on 1 agent"), sameLook)).toBe(
      updated,
    );
    // regression: while a switch waited out the hold, the island fell back to the older text
    const pending = advanceIslandHold(updated, look("tool:edit"), sameLook);
    expect(pending.wanted.key).toBe("tool:edit");
    expect(pending.shown.label).toBe("Waiting on 1 agent");
    expect(
      replay([
        [0, look("subagents", "Waiting on 2 agents")],
        [500, look("subagents", "Waiting on 1 agent")],
        [900, look("tool:edit")],
      ]).shown,
    ).toEqual([
      [0, "subagents"],
      [1000, "tool:edit"],
    ]);
  });

  it("drops a pending switch when the wanted state returns to the shown one", () => {
    const { shown, state } = replay([
      [0, look("tool:run")],
      [300, look("tool:edit")],
      [600, look("tool:run")],
    ]);
    expect(shown).toEqual([[0, "tool:run"]]);
    expect(state && islandShowsWanted({ ...state, minShown: true })).toBe(false);
  });
});

describe("turnIslandSummary", () => {
  it.each([
    [undefined, "5.2s", "Work 5.2s"],
    [undefined, null, "Work"],
    ["interrupted", "5.2s", "Stopped 5.2s"],
    ["interrupted", null, "Stopped"],
    ["failed", "1m 12s", "Failed 1m 12s"],
    ["failed", null, "Failed"],
  ] as const)("summarizes outcome %s with duration %s as %s", (outcome, duration, expected) => {
    expect(turnIslandSummary(outcome, duration)).toBe(expected);
  });
});
