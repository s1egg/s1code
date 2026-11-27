import { RunId } from "@s1tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  deriveMessagesTimelineRows,
  liveWorkEntryLabel,
  workEntryDisplayLabel,
} from "./MessagesTimeline.logic";

describe("long active tool groups", () => {
  it.each([false, true])(
    "preserves chronological order and the latest activity, expanded=%s",
    (expanded) => {
      const runId = RunId.make("long-active-run");
      const createdAt = "2026-10-12T00:00:00Z";
      const timelineEntries = Array.from({ length: 1_000 }, (_, index) => ({
        id: `work-entry-${index}`,
        kind: "work" as const,
        createdAt,
        entry: {
          id: `work-${index}`,
          createdAt,
          runId,
          label: `Tool ${index}`,
          tone: index % 2 === 0 ? ("thinking" as const) : ("tool" as const),
          itemType: index % 2 === 0 ? ("reasoning" as const) : ("command_execution" as const),
          ...(index % 2 === 0 ? { detail: `Thought ${index}` } : {}),
          toolLifecycleStatus: index === 999 ? ("inProgress" as const) : ("completed" as const),
        },
      }));
      const rows = deriveMessagesTimelineRows({
        timelineEntries,
        isWorking: true,
        runningRunId: runId,
        activeTurnStartedAt: createdAt,
        turnDiffSummaries: [],
        supportsConversationRollback: false,
        expandedRunIds: new Set(expanded ? [runId] : []),
      });
      const island = rows.find((row) => row.kind === "turn-fold");
      if (island?.kind !== "turn-fold") throw new Error("Expected the turn's island");
      expect(island.live).toMatchObject({ activity: "tool", tool: "run" });
      expect(island.live?.caption).toEqual({ id: "work-entry-998", text: "Thought 998" });
      expect(island.stepCount).toBe(1_000);
      // The film holds only the newest finished commands; older ones count into "+N".
      expect(island.film.map(({ id }) => id)).toEqual([
        "work-989",
        "work-991",
        "work-993",
        "work-995",
        "work-997",
      ]);
      expect(island.filmHiddenCount).toBe(494);
      const details = rows.filter((row) => row.kind === "work");
      expect(details).toHaveLength(expanded ? 1 : 0);
      if (expanded) {
        expect(
          details[0]?.kind === "work" && details[0].groupedEntries.map(({ id }) => id),
        ).toEqual(timelineEntries.map(({ entry }) => entry.id));
      }
    },
  );
});

describe("liveWorkEntryLabel for a command execution without a command", () => {
  it.each([
    {
      status: "inProgress" as const,
      active: true,
      toolTitle: "Ran command",
      expected: "Running command",
    },
    {
      status: "inProgress" as const,
      active: true,
      toolTitle: "Command",
      expected: "Running command",
    },
    {
      status: "failed" as const,
      active: false,
      toolTitle: "Ran command",
      expected: "Failed command",
    },
    {
      status: "failed" as const,
      active: false,
      toolTitle: "Run command",
      expected: "Failed command",
    },
  ])(
    "labels a $status entry titled $toolTitle as $expected",
    ({ status, active, toolTitle, expected }) => {
      const entry = {
        id: "work-empty-command",
        createdAt: "2026-10-12T00:00:00Z",
        label: "Ran command",
        toolTitle,
        tone: "tool" as const,
        itemType: "command_execution" as const,
        command: "",
        toolLifecycleStatus: status,
      };
      expect(liveWorkEntryLabel(entry, undefined, active)).toBe(expected);
      expect(workEntryDisplayLabel(entry, undefined)).toBe(expected);
    },
  );
});
