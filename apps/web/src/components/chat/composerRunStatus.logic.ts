import type { OrchestrationV2PlanArtifact, RunId } from "@s1tools/contracts";

/** Steps done in the todo list the running run keeps; a list from an earlier run says nothing about this one. */
export function activeRunTaskProgress(
  plans: ReadonlyArray<OrchestrationV2PlanArtifact> | undefined,
  runId: RunId | null | undefined,
): { readonly done: number; readonly total: number } | null {
  if (!plans || runId == null) return null;
  const plan = plans.findLast(
    (candidate) =>
      candidate.kind === "todo_list" && candidate.runId === runId && candidate.status === "active",
  );
  if (plan?.kind !== "todo_list" || plan.steps.length === 0) return null;
  return {
    done: plan.steps.filter((step) => step.status === "completed").length,
    total: plan.steps.length,
  };
}
