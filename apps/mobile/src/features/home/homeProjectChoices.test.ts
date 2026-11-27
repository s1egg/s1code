import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@s1tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@s1tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { makeThreadShellFixture } from "../../test-fixtures";
import {
  HOME_UNASSIGNED_PROJECT_KEY,
  homeProjectChoicesFor,
  resolveHomeProjectChoice,
} from "./homeProjectChoices";

const NOW = "2026-06-02T00:00:00.000Z";
const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");

function makeProject(environmentId: EnvironmentId, id: string, title: string): EnvironmentProject {
  return {
    environmentId,
    id: ProjectId.make(id),
    title,
    workspaceRoot: `/workspaces/${id}`,
    repositoryIdentity: null,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
}

function makeThread(
  project: EnvironmentProject,
  id: string,
  input: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
  return makeThreadShellFixture({
    environmentId: project.environmentId,
    projectId: project.id,
    id: ThreadId.make(id),
    title: id,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archivedAt: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...input,
  });
}

const running = {
  status: "running" as const,
  activeRunId: null,
  providerInstanceId: ProviderInstanceId.make("codex"),
  providerName: "Codex",
  lastError: null,
  updatedAt: NOW,
};

describe("homeProjectChoicesFor", () => {
  const app = makeProject(local, "app", "app");
  const relay = makeProject(remote, "relay", "relay");
  const threads = [
    makeThread(app, "runs", { runtime: running }),
    makeThread(app, "asks", { runtime: running, hasPendingApprovals: true }),
    makeThread(app, "settled-asks", { hasPendingApprovals: true, settledOverride: "settled" }),
    makeThread(app, "snoozed-runs", {
      runtime: running,
      snoozedUntil: "2026-06-03T00:00:00.000Z",
      snoozedAt: "2026-06-01T12:00:00.000Z",
    }),
    makeThread(app, "woke", {
      snoozedAt: "2026-06-01T08:00:00.000Z",
      snoozedUntil: "2026-06-01T12:00:00.000Z",
      lastVisitedAt: "2026-06-01T09:00:00.000Z",
    }),
    makeThread(relay, "idle"),
  ];
  const build = (environmentId: EnvironmentId | null) =>
    homeProjectChoicesFor({
      projects: [app, relay],
      threads,
      pendingTasks: [],
      environmentId,
      projectGroupingMode: "repository",
      now: NOW,
    });

  it("counts working and waiting threads per project, leaving snoozed and settled ones out", () => {
    const choices = build(null);
    const appChoice = choices.find((choice) => choice.title === "app");
    expect(appChoice).toMatchObject({ running: 1, waiting: 1, review: 1 });
    expect(appChoice?.environmentIds).toEqual([local]);
    expect(choices.find((choice) => choice.title === "relay")).toMatchObject({
      running: 0,
      waiting: 0,
    });
  });

  it("offers only the selected environment's projects", () => {
    expect(build(remote).map((choice) => choice.title)).toEqual(["relay"]);
  });
});

describe("project choices that keep history in reach", () => {
  const app = makeProject(local, "app", "app");
  const old = { ...makeProject(local, "old", "old"), archivedAt: "2026-06-01T00:00:00.000Z" };
  const idle = { ...makeProject(local, "idle", "idle"), archivedAt: "2026-06-01T00:00:00.000Z" };
  const scratch = { ...makeProject(local, "scratch", "scratch"), isScratch: true as const };
  const orphan = makeProject(local, "gone", "gone");
  const build = (input: {
    readonly threads: ReadonlyArray<EnvironmentThreadShell>;
    readonly pendingTasks?: ReadonlyArray<{ environmentId: EnvironmentId; projectId: ProjectId }>;
    readonly olderSettledProjects?: ReadonlyArray<{
      environmentId: EnvironmentId;
      projectId: ProjectId;
    }>;
    readonly environmentId?: EnvironmentId | null;
  }) =>
    homeProjectChoicesFor({
      projects: [app, old, idle, scratch],
      threads: input.threads,
      pendingTasks: input.pendingTasks ?? [],
      olderSettledProjects: input.olderSettledProjects ?? [],
      environmentId: input.environmentId ?? null,
      projectGroupingMode: "repository",
      now: NOW,
    });

  it("lists an archived project only while it holds a listed thread or an unsent task", () => {
    expect(
      build({
        threads: [],
        olderSettledProjects: [{ environmentId: local, projectId: old.id }],
      }).map((choice) => choice.title),
    ).toEqual(["app", "old"]);
    expect(build({ threads: [] }).map((choice) => choice.title)).toEqual(["app"]);
    expect(build({ threads: [makeThread(old, "kept")] }).map((choice) => choice.title)).toEqual([
      "app",
      "old",
    ]);
    expect(
      build({ threads: [makeThread(old, "gone", { archivedAt: NOW })] }).map(
        (choice) => choice.title,
      ),
    ).toEqual(["app"]);
    expect(
      build({ threads: [], pendingTasks: [{ environmentId: local, projectId: idle.id }] }).map(
        (choice) => choice.title,
      ),
    ).toEqual(["app", "idle"]);
  });

  it("gathers scratch and orphaned threads into one last choice", () => {
    const choices = build({
      threads: [makeThread(scratch, "scribble"), makeThread(orphan, "stray", { runtime: running })],
    });
    const unassigned = choices.at(-1);
    expect(unassigned).toMatchObject({
      key: HOME_UNASSIGNED_PROJECT_KEY,
      scope: null,
      running: 1,
    });
    expect(unassigned?.projectRefs.map((ref) => ref.projectId).toSorted()).toEqual([
      "gone",
      "scratch",
    ]);
  });

  it("leaves another environment's threads out of the orphan choice", () => {
    const elsewhere = makeProject(remote, "elsewhere", "elsewhere");
    expect(
      build({ threads: [makeThread(elsewhere, "far")], environmentId: local }).map(
        (choice) => choice.key,
      ),
    ).not.toContain(HOME_UNASSIGNED_PROJECT_KEY);
  });
});

describe("resolveHomeProjectChoice", () => {
  const app = makeProject(local, "app", "app");
  const relay = makeProject(local, "relay", "relay");
  const scratch = { ...makeProject(local, "scratch", "scratch"), isScratch: true as const };
  const projects = [app, relay, scratch];
  const choices = homeProjectChoicesFor({
    projects,
    threads: [makeThread(relay, "recent", { updatedAt: NOW }), makeThread(scratch, "scribble")],
    pendingTasks: [],
    environmentId: null,
    projectGroupingMode: "repository",
    now: NOW,
  });
  const resolve = (selectedProjectKey: string | null) =>
    resolveHomeProjectChoice({
      choices,
      selectedProjectKey,
      projects,
      projectGroupingMode: "repository",
    })?.title;

  it("keeps the stored project selected", () => {
    const appKey = choices.find((choice) => choice.title === "app")!.key;
    expect(resolve(appKey)).toBe("app");
  });

  it("falls back to the most recent project when nothing or a removed project is stored", () => {
    expect(resolve(null)).toBe("relay");
    expect(resolve("environment-local:deleted")).toBe("relay");
  });

  it("reads a single project's key and the old scratch key as their choices", () => {
    expect(resolve("local:app")).toBe("app");
    expect(resolve("\0no-project")).toBe(choices.at(-1)?.title);
    expect(choices.at(-1)?.key).toBe(HOME_UNASSIGNED_PROJECT_KEY);
  });

  it("selects nothing only when there is nothing to offer", () => {
    expect(
      resolveHomeProjectChoice({
        choices: [],
        selectedProjectKey: null,
        projects: [],
        projectGroupingMode: "repository",
      }),
    ).toBeNull();
  });
});
