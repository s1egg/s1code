import {
  NodeId,
  type OrchestrationV2PlanArtifact,
  type OrchestrationV2PlanStep,
  PlanId,
  RunId,
  ThreadId,
} from "@s1tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { activeRunTaskProgress } from "./composerRunStatus.logic";

const step = (id: string, status: OrchestrationV2PlanStep["status"]): OrchestrationV2PlanStep => ({
  id,
  text: `Step ${id}`,
  status,
});

const todoList = (
  id: string,
  runId: string,
  status: OrchestrationV2PlanArtifact["status"],
  steps: ReadonlyArray<OrchestrationV2PlanStep>,
): OrchestrationV2PlanArtifact => ({
  id: PlanId.make(id),
  threadId: ThreadId.make("thread"),
  runId: RunId.make(runId),
  nodeId: NodeId.make(`node-${id}`),
  kind: "todo_list",
  status,
  steps,
});

describe("activeRunTaskProgress", () => {
  it("counts the running run's latest active todo list", () => {
    const plans = [
      todoList("old", "run", "superseded", [step("a", "completed")]),
      todoList("new", "run", "active", [
        step("a", "completed"),
        step("b", "running"),
        step("c", "pending"),
      ]),
    ];
    expect(activeRunTaskProgress(plans, RunId.make("run"))).toEqual({ done: 1, total: 3 });
  });

  it("ignores lists from other runs, finished lists and proposed plans", () => {
    const plans: OrchestrationV2PlanArtifact[] = [
      todoList("earlier", "earlier-run", "active", [step("a", "pending")]),
      todoList("done", "run", "completed", [step("a", "completed")]),
      {
        id: PlanId.make("proposal"),
        threadId: ThreadId.make("thread"),
        runId: RunId.make("run"),
        nodeId: NodeId.make("node-proposal"),
        kind: "proposed_plan",
        status: "active",
        markdown: "# Plan",
      },
    ];
    expect(activeRunTaskProgress(plans, RunId.make("run"))).toBeNull();
    expect(activeRunTaskProgress(plans, null)).toBeNull();
    expect(activeRunTaskProgress(undefined, RunId.make("run"))).toBeNull();
  });
});
