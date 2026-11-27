import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";
import type { WorkLogEntry } from "../../session-logic";
import {
  captionSourceLine,
  workEntryIconName,
  workStepChip,
  workStepIslandTarget,
  workStepParts,
} from "./TimelineWorkEntryRow.logic";

const CREATED_AT = "2026-11-27T10:00:00.000Z";

function entry(fields: Partial<WorkLogEntry>): WorkLogEntry {
  return { id: "step", createdAt: CREATED_AT, label: "Tool", tone: "tool", ...fields };
}

function item(type: string, fields: Record<string, unknown> = {}) {
  return {
    id: "step",
    threadId: "thread-1",
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 0,
    status: "completed",
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: DateTime.makeUnsafe(CREATED_AT),
    type,
    ...fields,
  } as unknown as NonNullable<WorkLogEntry["structuredPayload"]>;
}

describe("workStepParts", () => {
  it("names the files a read opened, as workspace paths", () => {
    expect(
      workStepParts(
        entry({
          itemType: "dynamic_tool",
          requestKind: "file-read",
          changedFiles: ["/repo/src/a.ts", "/repo/src/b.ts"],
          toolLifecycleStatus: "completed",
        }),
        "/repo",
      ),
    ).toEqual({
      verb: "Read",
      target: "repo/src/a.ts, repo/src/b.ts",
      targetIsCode: true,
      result: { kind: "count", value: 2, noun: "file" },
    });
  });

  it("shows an edit's diff and folds extra files into the target", () => {
    const parts = workStepParts(
      entry({
        itemType: "file_change",
        changedFiles: ["/repo/src/a.ts", "/repo/src/b.ts"],
        toolLifecycleStatus: "completed",
        structuredPayload: item("file_change", {
          fileName: "src/a.ts",
          additions: 3,
          deletions: 1,
        }),
      }),
      "/repo",
    );
    expect(parts.verb).toBe("Edit");
    expect(parts.target).toBe("repo/src/a.ts +1 more");
    expect(parts.result).toEqual({ kind: "diff", additions: 3, deletions: 1 });
  });

  it("counts a unified diff when the item has no totals", () => {
    const parts = workStepParts(
      entry({
        itemType: "file_change",
        changedFiles: ["src/a.ts"],
        toolLifecycleStatus: "completed",
        structuredPayload: item("file_change", {
          fileName: "src/a.ts",
          diffStr: "--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n keep\n-old\n+new\n+added",
        }),
      }),
      undefined,
    );
    expect(parts.result).toEqual({ kind: "diff", additions: 2, deletions: 1 });
  });

  it("times a running command and reports a finished one's duration or exit code", () => {
    const command = (fields: Partial<WorkLogEntry>, payload: Record<string, unknown> = {}) =>
      workStepParts(
        entry({
          itemType: "command_execution",
          command: "vp test run",
          structuredPayload: item("command_execution", { input: "vp test run", ...payload }),
          ...fields,
        }),
        undefined,
      );
    expect(command({ toolLifecycleStatus: "inProgress" })).toMatchObject({
      verb: "Run",
      target: "vp test run",
      result: { kind: "live", startedAt: CREATED_AT },
    });
    expect(
      command(
        { toolLifecycleStatus: "completed" },
        {
          startedAt: DateTime.makeUnsafe(CREATED_AT),
          completedAt: DateTime.makeUnsafe("2026-11-27T10:00:02.500Z"),
        },
      ).result,
    ).toEqual({ kind: "duration", ms: 2_500 });
    expect(
      command(
        { toolLifecycleStatus: "completed" },
        {
          startedAt: DateTime.makeUnsafe(CREATED_AT),
          completedAt: DateTime.makeUnsafe("2026-11-27T10:00:00.400Z"),
        },
      ).result,
    ).toBeNull();
    expect(command({ toolLifecycleStatus: "failed" }, { exitCode: 2 }).result).toEqual({
      kind: "exit",
      code: 2,
    });
    expect(command({ toolLifecycleStatus: "declined" }).result).toEqual({ kind: "declined" });
  });

  it("counts code search hits and web results", () => {
    const search = (
      results: ReadonlyArray<{ fileName: string; line?: number; preview?: string }>,
    ) =>
      workStepParts(
        entry({
          itemType: "file_search",
          toolLifecycleStatus: "completed",
          structuredPayload: item("file_search", { pattern: "truncate(", results }),
        }),
        undefined,
      );
    expect(
      search([
        { fileName: "a.ts", line: 3 },
        { fileName: "b.ts", line: 9 },
        { fileName: "src", preview: "(results truncated)" },
      ]),
    ).toEqual({
      verb: "Search",
      target: "truncate(",
      targetIsCode: true,
      result: { kind: "count", value: 2, noun: "hit" },
    });
    // Unparsed grep output arrives as one line-less record, even when it says nothing matched.
    expect(search([{ fileName: "src", preview: "No matches found" }]).result).toBeNull();
    expect(
      workStepParts(
        entry({
          itemType: "web_search",
          toolLifecycleStatus: "completed",
          structuredPayload: item("web_search", {
            patterns: ["effect schema unions"],
            results: [{}, {}, {}],
          }),
        }),
        undefined,
      ),
    ).toEqual({
      verb: "Web",
      target: "effect schema unions",
      targetIsCode: false,
      result: { kind: "count", value: 3, noun: "result" },
    });
  });

  it("labels reasoning by its first line", () => {
    expect(
      workStepParts(
        entry({
          itemType: "reasoning",
          tone: "thinking",
          detail: "Slicing splits surrogate pairs\nMore detail",
          toolLifecycleStatus: "completed",
        }),
        undefined,
      ),
    ).toEqual({
      verb: "Thought",
      target: "Slicing splits surrogate pairs",
      targetIsCode: false,
      result: null,
    });
  });

  it("keeps the whole label for tools without a fixed verb", () => {
    const parts = workStepParts(
      entry({
        itemType: "dynamic_tool",
        toolLifecycleStatus: "failed",
        structuredPayload: item("dynamic_tool", { toolName: "custom_tool", input: {} }),
      }),
      undefined,
      undefined,
      "Custom tool",
    );
    expect(parts).toEqual({
      verb: null,
      target: "Custom tool",
      targetIsCode: false,
      result: { kind: "failed" },
    });
  });
});

describe("workStepChip", () => {
  it("keeps only the short result and marks failures", () => {
    const step = entry({
      id: "edit",
      itemType: "file_change",
      changedFiles: ["src/a.ts"],
      toolLifecycleStatus: "completed",
      structuredPayload: item("file_change", { fileName: "src/a.ts", additions: 2, deletions: 0 }),
    });
    expect(workStepChip(step, workStepParts(step, undefined))).toMatchObject({
      id: "edit",
      iconName: "square-pen",
      text: { kind: "diff", additions: 2, deletions: 0 },
      failed: false,
    });
    expect(
      workStepChip(step, {
        verb: "Run",
        target: "x",
        targetIsCode: true,
        result: { kind: "exit", code: 1 },
      }),
    ).toMatchObject({ text: { kind: "exit", code: 1 }, failed: true });
  });

  it("marks a command that succeeded, since its counts are unknown", () => {
    const command = entry({
      id: "run",
      itemType: "command_execution",
      command: "vp test run",
      toolLifecycleStatus: "completed",
      structuredPayload: item("command_execution", { input: "vp test run", exitCode: 0 }),
    });
    expect(workStepChip(command, workStepParts(command, undefined))).toMatchObject({
      iconName: "terminal",
      text: { kind: "ok" },
      failed: false,
    });
    const stopped = { ...command, toolLifecycleStatus: "stopped" as const };
    expect(workStepChip(stopped, workStepParts(stopped, undefined))).toMatchObject({
      text: null,
      failed: false,
    });
  });
});

describe("workStepIslandTarget", () => {
  it("names one file, counts several, and keeps other targets", () => {
    const read = (changedFiles: string[]) =>
      entry({
        itemType: "dynamic_tool",
        requestKind: "file-read",
        changedFiles,
        toolLifecycleStatus: "completed",
      });
    const one = read(["/repo/src/lib/truncate.ts"]);
    expect(workStepIslandTarget(one, workStepParts(one, "/repo"), "/repo")).toBe("truncate.ts");
    const many = read(["/repo/a.ts", "/repo/b.ts", "/repo/c.ts", "/repo/d.ts"]);
    expect(workStepIslandTarget(many, workStepParts(many, "/repo"), "/repo")).toBe("4 files");
    const command = entry({
      itemType: "command_execution",
      command: "vp test run",
      toolLifecycleStatus: "inProgress",
    });
    expect(workStepIslandTarget(command, workStepParts(command, undefined), undefined)).toBe(
      "vp test run",
    );
  });
});

describe("captionSourceLine", () => {
  // regression: the caption showed the first sentence, not what the agent said latest
  it("keeps the last non-empty line, whole", () => {
    expect(captionSourceLine("Checking the parser.\nFound the failing branch.\n\n")).toBe(
      "Found the failing branch.",
    );
    expect(captionSourceLine("Starting the Android build. It takes a while.")).toBe(
      "Starting the Android build. It takes a while.",
    );
    expect(captionSourceLine("**Plan**\n\n- Patch `truncate()` first")).toBe(
      "Patch `truncate()` first",
    );
  });
});

describe("file change verbs", () => {
  it("names a new, deleted, moved, or edited file the same way in parts and icon", () => {
    const change = (changes?: ReadonlyArray<Record<string, string>>) =>
      entry({
        itemType: "file_change",
        changedFiles: ["src/a.ts"],
        toolLifecycleStatus: "completed",
        structuredPayload: item("file_change", {
          fileName: "src/a.ts",
          additions: 1,
          deletions: 0,
          ...(changes ? { changes } : {}),
        }),
      });
    const verbAndIcon = (step: ReturnType<typeof change>) => [
      workStepParts(step, undefined).verb,
      workEntryIconName(step),
    ];
    expect(verbAndIcon(change([{ operation: "add", path: "src/a.ts" }]))).toEqual([
      "Write",
      "file-plus",
    ]);
    expect(verbAndIcon(change([{ operation: "delete", path: "src/a.ts" }]))).toEqual([
      "Delete",
      "file-x",
    ]);
    expect(
      verbAndIcon(change([{ operation: "update", path: "src/b.ts", oldPath: "src/a.ts" }])),
    ).toEqual(["Move", "file-move"]);
    expect(verbAndIcon(change([{ operation: "update", path: "src/a.ts" }]))).toEqual([
      "Edit",
      "square-pen",
    ]);
    expect(verbAndIcon(change())).toEqual(["Edit", "square-pen"]);
    expect(
      verbAndIcon(
        change([
          { operation: "add", path: "src/a.ts" },
          { operation: "delete", path: "src/b.ts" },
        ]),
      ),
    ).toEqual(["Edit", "square-pen"]);
  });
});

describe("plan steps", () => {
  it("reads a task list as a plan step with its progress", () => {
    const plan = (statuses: ReadonlyArray<"pending" | "running" | "completed">) =>
      workStepParts(
        entry({
          itemType: "todo_list",
          tone: "info",
          label: "Tasks",
          toolLifecycleStatus: "completed",
          structuredPayload: item("todo_list", {
            planId: "plan",
            steps: statuses.map((status, index) => ({
              id: `${index}`,
              text: `Task ${index}`,
              status,
            })),
          }),
        }),
        undefined,
      );
    expect(plan(["completed", "completed", "completed"])).toEqual({
      verb: "Plan",
      target: "3/3 done",
      targetIsCode: false,
      result: null,
    });
    expect(plan(["completed", "running", "pending"])).toMatchObject({
      target: "Task 1",
      result: { kind: "progress", done: 1, total: 3 },
    });
  });
});

describe("URL targets", () => {
  it("shortens a URL to its host and last segment on the island", () => {
    const fetch = (url: string) =>
      entry({
        itemType: "web_search",
        toolLifecycleStatus: "completed",
        structuredPayload: item("web_search", { patterns: [url] }),
      });
    const target = (url: string) => {
      const step = fetch(url);
      return workStepIslandTarget(step, workStepParts(step, undefined), undefined);
    };
    expect(
      target(
        "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter",
      ),
    ).toBe("developer.mozilla.org/…/Segmenter");
    expect(target("https://example.com/docs")).toBe("example.com/docs");
    expect(target("https://example.com/")).toBe("example.com");
    expect(workStepParts(fetch("https://example.com/a/b"), undefined).target).toBe(
      "https://example.com/a/b",
    );
  });
});
