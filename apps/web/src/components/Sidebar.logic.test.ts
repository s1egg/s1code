import { presentThreadShell } from "@s1tools/client-runtime/state/models";
import { threadKey } from "@s1tools/client-runtime/state/entities";
import { isThreadWorking as isSidebarThreadWorking } from "@s1tools/client-runtime/state/thread-inbox";
import * as DateTime from "effect/DateTime";
import { deriveActiveWorkStartedAt } from "../session-logic.ts";
import { describe, expect, it } from "vite-plus/test";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import {
  buildSidebarRailEntries,
  findSidebarRailEntryKey,
  isSidebarThreadUnseen,
  resolveSidebarInboxGroup,
  resolveAdjacentThreadId,
  resolveSidebarRailSelection,
  resolveStoredSidebarRailKey,
  SIDEBAR_UNASSIGNED_RAIL_KEY,
  sidebarRailEntryProjectIds,
  sidebarThreadNeedsUser,
  shouldCreateNewThreadInCurrentProject,
  deleteSelectedThreadEntries,
  getFallbackThreadIdAfterDelete,
  hasUnseenCompletion,
  orderItemsByPreferredIds,
  pinOrderKeyBetween,
  resolveSidebarSweepKeys,
  resolveSidebarRowStatus,
  resolveSidebarThreadStatus,
  resolveThreadStatusPill,
  resolveWindowTitleThreadStatus,
  resolveWorkingStartedAt,
  searchSidebarThreads,
  sortInboxThreadsByReturn,
  resolveSidebarDropTarget,
  planSidebarThreadDrop,
  resolveSidebarReorderableThreadKeys,
  sortPinnedThreadsForSidebar,
  sortScopedProjectsForSidebar,
  sortSidebarV2ProjectGroups,
  shouldNavigateAfterThreadPark,
  type SidebarListItem,
  type SidebarListMarker,
  type SidebarSection,
  resolveSidebarDropVerb,
  withoutRemovedCheckout,
} from "./Sidebar.logic";
import { scopeThreadRef, scopedThreadKey } from "@s1tools/client-runtime/environment";
import {
  activeThreadSortKey,
  sortActiveThreadsByOrderKey,
  sortPinnedThreadsByOrderKey,
} from "@s1tools/client-runtime/state/thread-sort";
import { threadSearchMatchKey } from "@s1tools/client-runtime/state/thread-search";
import { EnvironmentId, ProjectId, ProviderInstanceId, RunId, ThreadId } from "@s1tools/contracts";

import {
  DEFAULT_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  type Project,
  type Thread,
} from "../types";
import { makeThreadFixture, type ThreadFixtureOverrides } from "../test-fixtures";
import {
  completeSidebarProjectReveal,
  completeSidebarRouteReveal,
  pendingSidebarRouteReveal,
  resolveSidebarRouteReveal,
  type SidebarRouteReveal,
} from "./sidebar/routeReveal";
import {
  derivePhysicalProjectKey,
  pickableProjectGroups,
} from "@s1tools/client-runtime/state/project-grouping";
import {
  buildSidebarProjectSnapshots,
  resolveNewThreadTargetForProjectRef,
  resolveProjectNewThreadTarget,
} from "../sidebarProjectGrouping";

const localEnvironmentId = EnvironmentId.make("environment-local");

describe("deleteSelectedThreadEntries", () => {
  const entries = [{ threadKey: "one" }, { threadKey: "two" }, { threadKey: "three" }] as const;
  const success = AsyncResult.success(undefined);
  const failure = AsyncResult.failure(Cause.fail(new Error("Delete failed")));
  const interrupted = AsyncResult.failure(Cause.interrupt());

  it("waits for each delete and excludes only earlier successes from worktree checks", async () => {
    let resolveDelete!: (result: typeof success) => void;
    const pendingDelete = new Promise<typeof success>((resolve) => {
      resolveDelete = resolve;
    });
    const worktreeChecks: { threadKey: string; deletedThreadKeys: string[] }[] = [];
    const deletion = deleteSelectedThreadEntries({
      entries,
      delete: async ({ threadKey }, deletedThreadKeys) => {
        worktreeChecks.push({ threadKey, deletedThreadKeys: [...deletedThreadKeys] });
        return threadKey === "one" ? pendingDelete : success;
      },
    });

    expect(worktreeChecks).toEqual([{ threadKey: "one", deletedThreadKeys: [] }]);
    resolveDelete(success);
    const outcome = await deletion;

    expect(worktreeChecks).toEqual([
      { threadKey: "one", deletedThreadKeys: [] },
      { threadKey: "two", deletedThreadKeys: ["one"] },
      { threadKey: "three", deletedThreadKeys: ["one", "two"] },
    ]);
    expect(outcome).toEqual({
      deletedThreadKeys: new Set(["one", "two", "three"]),
      firstFailure: null,
    });
  });

  it("continues after ordinary failures and keeps the first failure", async () => {
    const laterFailure = AsyncResult.failure(Cause.fail(new Error("Later failure")));
    const deletedKeysAtLastEntry: string[][] = [];
    const outcome = await deleteSelectedThreadEntries({
      entries: [...entries, { threadKey: "four" }],
      delete: async ({ threadKey }, deletedThreadKeys) => {
        if (threadKey === "one") return failure;
        if (threadKey === "three") return laterFailure;
        if (threadKey === "four") deletedKeysAtLastEntry.push([...deletedThreadKeys]);
        return success;
      },
    });

    expect(deletedKeysAtLastEntry).toEqual([["two"]]);
    expect(outcome).toEqual({
      deletedThreadKeys: new Set(["two", "four"]),
      firstFailure: failure,
    });
  });

  it.each([
    { firstResult: success, deletedThreadKeys: new Set(["one"]), firstFailure: null },
    { firstResult: failure, deletedThreadKeys: new Set<string>(), firstFailure: failure },
  ])("stops on interruption and preserves earlier results %#", async (testCase) => {
    const attemptedThreadKeys: string[] = [];
    const outcome = await deleteSelectedThreadEntries({
      entries,
      delete: async ({ threadKey }) => {
        attemptedThreadKeys.push(threadKey);
        return threadKey === "one" ? testCase.firstResult : interrupted;
      },
    });

    expect(attemptedThreadKeys).toEqual(["one", "two"]);
    expect(outcome).toEqual({
      deletedThreadKeys: testCase.deletedThreadKeys,
      firstFailure: testCase.firstFailure,
    });
  });
});

function makeLatestRun(overrides?: {
  completedAt?: string | null;
  startedAt?: string | null;
}): NonNullable<Thread["latestRun"]> {
  return {
    runId: "turn-1" as never,
    status: "completed",
    assistantMessageId: null,
    requestedAt: "2026-03-09T10:00:00.000Z",
    startedAt:
      overrides?.startedAt !== undefined ? overrides.startedAt : "2026-03-09T10:00:00.000Z",
    completedAt:
      overrides?.completedAt !== undefined ? overrides.completedAt : "2026-03-09T10:05:00.000Z",
  };
}

describe("withoutRemovedCheckout", () => {
  const worktree = { branch: "s1/task", worktreePath: "/worktrees/task" };
  const local = { branch: "main", worktreePath: null };
  const removed = { branch: null, worktreePath: null };
  const tracking = { trackedFolders: [{ path: "/work/wrapper/api" }] };

  it.each([
    {
      why: "status still loading",
      thread: worktree,
      isRepo: undefined,
      project: null,
      to: worktree,
    },
    { why: "a live checkout", thread: worktree, isRepo: true, project: null, to: worktree },
    { why: "a removed worktree", thread: worktree, isRepo: false, project: null, to: removed },
    {
      why: "a removed worktree of a project tracking nothing",
      thread: worktree,
      isRepo: false,
      project: { trackedFolders: [] },
      to: removed,
    },
    {
      why: "a plain task folder of a project with tracked folders",
      thread: worktree,
      isRepo: false,
      project: tracking,
      to: worktree,
    },
    {
      why: "a local thread whose project folder is not a repository",
      thread: local,
      isRepo: false,
      project: tracking,
      to: removed,
    },
  ])("$why", ({ thread, isRepo, project, to }) => {
    expect(withoutRemovedCheckout(thread, { isRepo }, project)).toEqual(to);
  });
});

describe("orderItemsByPreferredIds", () => {
  it("resolves legacy preference aliases without materializing project state", () => {
    const ordered = orderItemsByPreferredIds({
      items: [
        { id: "physical-a", cwd: "/work/a" },
        { id: "physical-b", cwd: "/work/b" },
        { id: "physical-c", cwd: "/work/c" },
      ],
      preferredIds: ["legacy:/work/c", "legacy:/work/a"],
      getId: (project) => project.id,
      getPreferenceIds: (project) => [project.id, `legacy:${project.cwd}`],
    });

    expect(ordered.map((project) => project.id)).toEqual([
      "physical-c",
      "physical-a",
      "physical-b",
    ]);
  });
});

describe("resolveSidebarThreadStatus", () => {
  const runtime = {
    status: "running" as const,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "Codex",
    lastError: null,
    updatedAt: "2026-03-09T10:00:00.000Z",
  };

  const idle = { hasPendingApprovals: false, hasPendingUserInput: false, runtime: null };

  it("prioritizes awaiting input over a running runtime, below approval", () => {
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        hasPendingUserInput: true,
        runtime,
        blockedOnThreadWait: true,
      }),
    ).toBe("input");
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        hasPendingApprovals: true,
        hasPendingUserInput: true,
        blockedOnThreadWait: true,
        runtime,
      }),
    ).toBe("approval");
  });

  it("shows a waiting guest message as a Request, below the agent's own requests", () => {
    expect(resolveSidebarThreadStatus({ ...idle, pendingGuestMessageCount: 1, runtime })).toBe(
      "request",
    );
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        hasPendingUserInput: true,
        pendingGuestMessageCount: 1,
      }),
    ).toBe("input");
  });

  it("keeps usage-limit stops Limited and visible until the thread recovers", () => {
    const limited = {
      ...runtime,
      status: "failed" as const,
      lastError: "Plan limit reached",
      lastErrorClass: "usage_limit" as const,
    };
    expect(resolveSidebarThreadStatus({ ...idle, runtime: limited })).toBe("limited");
    expect(
      resolveSidebarThreadStatus({ ...idle, runtime: { ...limited, status: "running" } }),
    ).toBe("working");
    expect(
      resolveSidebarThreadStatus({ ...idle, runtime: { ...limited, status: "completed" } }),
    ).toBe("ready");
  });

  it("reports worktree setup as preparing, and failed only while the latest run failed", () => {
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        runtime: { ...runtime, status: "preparing" as const },
      }),
    ).toBe("preparing");
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        runtime: { ...runtime, status: "failed" as const, lastError: "boom" },
      }),
    ).toBe("failed");
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        runtime: { ...runtime, status: "completed" as const, lastError: "persisted" },
      }),
    ).toBe("ready");
    expect(
      resolveSidebarThreadStatus({
        ...idle,
        runtime: { ...runtime, status: "idle" as const, lastError: "persisted" },
      }),
    ).toBe("waiting");
  });

  it("titles the window with live work and requests only", () => {
    const cases = [
      [{ ...idle, hasPendingApprovals: true, runtime }, "Needs approval"],
      [{ ...idle, hasPendingUserInput: true }, "Needs your input"],
      [{ ...idle, runtime: { ...runtime, status: "preparing" as const } }, "Working"],
      [{ ...idle, runtime }, "Working"],
      [{ ...idle, runtime, pendingGuestMessageCount: 1 }, "Working"],
      [{ ...idle, runtime, blockedOnThreadWait: true }, "Working"],
      [{ ...idle, runtime: { ...runtime, status: "idle" as const } }, null],
      [{ ...idle, runtime: { ...runtime, status: "failed" as const } }, null],
      [{ ...idle, runtime: { ...runtime, status: "completed" as const } }, null],
      [idle, null],
    ] as const;
    for (const [thread, title] of cases) {
      expect(resolveWindowTitleThreadStatus(thread)).toBe(title);
    }
  });
});

describe("resolveSidebarRowStatus", () => {
  const failedRuntime = {
    status: "failed" as const,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "Codex",
    lastError: "Provider turn failed.",
    updatedAt: "2026-03-09T10:05:00.000Z",
  };
  const failed = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default" as const,
    runtime: failedRuntime,
    latestRun: { ...makeLatestRun(), status: "failed" as const },
  };

  it("settles a failure the user opened to ready, without showing Done", () => {
    expect(resolveSidebarRowStatus({ ...failed, lastVisitedAt: undefined })).toBe("failed");

    const opened = { ...failed, lastVisitedAt: "2026-03-09T10:06:00.000Z" };
    expect(resolveSidebarRowStatus(opened)).toBe("ready");
    expect(hasUnseenCompletion(opened)).toBe(false);
    // A runtime failure without a failed run has no date, so a visit cannot settle it.
    expect(resolveSidebarRowStatus({ ...opened, latestRun: null })).toBe("failed");
  });

  it("does not show a stopped run as an unseen completion", () => {
    for (const status of ["interrupted", "cancelled"] as const) {
      const stopped = {
        ...failed,
        runtime: { ...failedRuntime, status, lastError: null },
        latestRun: { ...makeLatestRun(), status },
        lastVisitedAt: "2026-03-09T10:01:00.000Z",
      };
      expect(hasUnseenCompletion(stopped)).toBe(false);
      expect(resolveThreadStatusPill({ thread: stopped })).toBeNull();
    }
  });
});

describe("searchSidebarThreads", () => {
  const searchThread = (id: string, title: string, latestUserMessageAt: string) => ({
    environmentId: localEnvironmentId,
    id: ThreadId.make(id),
    title,
    branch: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: latestUserMessageAt,
    latestUserMessageAt,
    opens: null,
  });
  const threads = [
    searchThread("thread-1", "Fix workspace search", "2026-10-20T00:00:00.000Z"),
    searchThread("thread-2", "Review providers", "2026-10-22T00:00:00.000Z"),
    searchThread("thread-3", "WORKTREE cleanup", "2026-09-01T00:00:00.000Z"),
    searchThread("thread-4", "Homework notes", "2026-10-22T00:00:00.000Z"),
  ];
  const now = Date.parse("2026-10-23T00:00:00.000Z");
  const contentKeys = (...ids: ReadonlyArray<string>) =>
    new Set(
      ids.map((id) =>
        threadSearchMatchKey({ environmentId: localEnvironmentId, threadId: ThreadId.make(id) }),
      ),
    );

  it("ranks word matches by recent use, then lists message matches once", () => {
    expect(searchSidebarThreads(threads, "work", contentKeys("thread-1", "thread-2"), now)).toEqual(
      {
        titleMatches: [threads[0], threads[2], threads[3]],
        contentMatches: [threads[1]],
      },
    );
  });
});

describe("resolveWorkingStartedAt", () => {
  const runtime = {
    status: "running" as const,
    providerName: "Codex",
    providerInstanceId: ProviderInstanceId.make("codex"),
    activeRunId: RunId.make("turn-1"),
    lastError: null,
    updatedAt: "2026-03-09T10:02:00.000Z",
  };

  it("does not invent a start from activity updates when the newest run completed", () => {
    expect(
      resolveWorkingStartedAt({
        latestRun: makeLatestRun(),
        runtime,
      }),
    ).toBeNull();
  });

  it.each(["queued", "cancelled"] as const)(
    "shares the detail timer when a newer run is %s",
    (status) => {
      const activityStartedAt = "2026-03-09T10:00:00.000Z";
      const latestRun = {
        ...makeLatestRun(),
        runId: RunId.make("newer-run"),
        status,
        startedAt: null,
        completedAt: status === "queued" ? null : "2026-03-09T10:05:00.000Z",
      };
      for (const updatedAt of ["2026-03-09T10:30:00.000Z", "2026-03-09T10:50:00.000Z"]) {
        const activeRuntime = { ...runtime, updatedAt, activityStartedAt };
        expect(resolveWorkingStartedAt({ latestRun, runtime: activeRuntime })).toBe(
          activityStartedAt,
        );
        expect(deriveActiveWorkStartedAt(latestRun, activeRuntime, updatedAt)).toBe(
          activityStartedAt,
        );
      }
      expect(
        deriveActiveWorkStartedAt(
          latestRun,
          { ...runtime, activityStartedAt: null },
          "2026-03-09T10:50:00.000Z",
        ),
      ).toBeNull();
    },
  );
});

describe("resolveThreadStatusPill", () => {
  const baseThread = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "plan" as const,
    latestRun: null,
    lastVisitedAt: undefined,
    runtime: {
      status: "running" as const,
      providerName: "Codex",
      providerInstanceId: ProviderInstanceId.make("codex"),
      activeRunId: "turn-1" as never,
      lastError: null,
      updatedAt: "2026-03-09T10:00:00.000Z",
    },
  };

  it("shows an active thread wait without a pulse and resumes Working when it ends", () => {
    const blocked = { ...baseThread, blockedOnThreadWait: true };
    expect(resolveSidebarThreadStatus(blocked)).toBe("waiting");
    expect(resolveThreadStatusPill({ thread: blocked })).toMatchObject({
      label: "Waiting",
      pulse: false,
    });

    const resumed = { ...blocked, blockedOnThreadWait: false };
    expect(resolveSidebarThreadStatus(resumed)).toBe("working");
    expect(resolveThreadStatusPill({ thread: resumed })).toMatchObject({
      label: "Working",
      pulse: true,
    });
  });

  it("shows waiting for an idle thread with pending background tasks", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          pendingBackgroundTasks: [
            { taskId: "bg-1", description: "Watch build", kind: "monitor", awaited: true },
          ],
          runtime: {
            ...baseThread.runtime,
            status: "idle",
            activeRunId: null,
          },
        },
      }),
    ).toMatchObject({
      label: "Waiting",
      colorClass: "text-sidebar-muted-foreground",
      dotClass: "bg-sidebar-muted-foreground",
      pulse: false,
    });
  });

  it("shows plan ready when a settled plan turn has a proposed plan ready for follow-up", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          hasActionableProposedPlan: true,
          latestRun: makeLatestRun(),
          runtime: {
            ...baseThread.runtime,
            status: "completed",
            activeRunId: null,
          },
        },
      }),
    ).toMatchObject({ label: "Plan Ready", pulse: false });
  });

  it("does not manufacture completed state without a client visit marker", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          latestRun: makeLatestRun(),
          runtime: {
            ...baseThread.runtime,
            status: "completed",
            activeRunId: null,
          },
        },
      }),
    ).toBeNull();
  });

  it("shows completed when there is an unseen completion and no active blocker", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          interactionMode: "default",
          latestRun: makeLatestRun(),
          lastVisitedAt: "2026-03-09T10:04:00.000Z",
          runtime: {
            ...baseThread.runtime,
            status: "completed",
            activeRunId: null,
          },
        },
      }),
    ).toMatchObject({ label: "Completed", pulse: false });
  });

  it("shows failed, not completed, when the unseen run failed", () => {
    const failed = {
      ...baseThread,
      interactionMode: "default" as const,
      latestRun: { ...makeLatestRun(), status: "failed" as const },
      lastVisitedAt: "2026-03-09T10:04:00.000Z",
      runtime: {
        ...baseThread.runtime,
        status: "failed" as const,
        activeRunId: null,
        lastError: "Provider turn failed.",
      },
    };
    expect(resolveThreadStatusPill({ thread: failed })).toMatchObject({
      label: "Failed",
      pulse: false,
    });
    // The failure sends the thread to the inbox, so its pill must not say it is still waiting.
    const watching = {
      ...failed,
      pendingBackgroundTasks: [
        {
          taskId: "pr-watch",
          description: "Watching pull request #7",
          kind: "monitor" as const,
          awaited: true as const,
        },
      ],
    };
    expect(isSidebarThreadWorking(watching)).toBe(false);
    expect(resolveThreadStatusPill({ thread: watching })).toMatchObject({ label: "Failed" });
    // A run blocked on another thread is still waiting, as its sidebar row says.
    const blocked = {
      ...watching,
      runtime: { ...failed.runtime, status: "running" as const },
      blockedOnThreadWait: true,
    };
    expect(resolveSidebarThreadStatus(blocked)).toBe("waiting");
    expect(resolveThreadStatusPill({ thread: blocked })).toMatchObject({ label: "Waiting" });
  });

  it("shows failed, not plan ready, when a plan run proposed a plan and then failed", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          hasActionableProposedPlan: true,
          latestRun: { ...makeLatestRun(), status: "failed" },
          lastVisitedAt: "2026-03-09T10:04:00.000Z",
          runtime: { ...baseThread.runtime, status: "failed", activeRunId: null },
        },
      }),
    ).toMatchObject({ label: "Failed" });
    // Once the failure is seen, the plan still does not read as ready, as on its row.
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          hasActionableProposedPlan: true,
          latestRun: { ...makeLatestRun(), status: "failed" },
          lastVisitedAt: "2026-03-09T10:06:00.000Z",
          runtime: { ...baseThread.runtime, status: "failed", activeRunId: null },
        },
      }),
    ).toBeNull();
  });

  it("drops the failed pill once the failure has been seen", () => {
    expect(
      resolveThreadStatusPill({
        thread: {
          ...baseThread,
          interactionMode: "default",
          latestRun: { ...makeLatestRun(), status: "failed" },
          lastVisitedAt: "2026-03-09T10:06:00.000Z",
          runtime: { ...baseThread.runtime, status: "failed", activeRunId: null },
        },
      }),
    ).toBeNull();
  });
});

function makeProject(overrides: Partial<Project> = {}): Project {
  const { defaultModelSelection, ...rest } = overrides;
  return {
    id: ProjectId.make("project-1"),
    environmentId: localEnvironmentId,
    title: "Project",
    workspaceRoot: "/tmp/project",
    repositoryIdentity: null,
    defaultModelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
      ...defaultModelSelection,
    },
    createdAt: "2026-03-09T10:00:00.000Z",
    updatedAt: "2026-03-09T10:00:00.000Z",
    scripts: [],
    ...rest,
  };
}

function makeThread(overrides: ThreadFixtureOverrides = {}): Thread {
  return makeThreadFixture({
    id: ThreadId.make("thread-1"),
    environmentId: localEnvironmentId,
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
      ...overrides?.modelSelection,
    },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    runtime: null,
    messages: [],
    proposedPlans: [],
    createdAt: "2026-03-09T10:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    updatedAt: "2026-03-09T10:00:00.000Z",
    latestRun: null,
    branch: null,
    worktreePath: null,
    ...overrides,
  });
}

describe("getFallbackThreadIdAfterDelete", () => {
  it("skips other threads being deleted in the same action", () => {
    const fallbackThreadId = getFallbackThreadIdAfterDelete({
      threads: [
        makeThread({
          id: ThreadId.make("thread-active"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:05:00.000Z",
          messages: [],
        }),
        makeThread({
          id: ThreadId.make("thread-newest"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:10:00.000Z",
          messages: [],
        }),
        makeThread({
          id: ThreadId.make("thread-next"),
          projectId: ProjectId.make("project-1"),
          createdAt: "2026-03-09T10:07:00.000Z",
          messages: [],
        }),
      ],
      deletedThreadId: ThreadId.make("thread-active"),
      deletedThreadIds: new Set([ThreadId.make("thread-active"), ThreadId.make("thread-newest")]),
      sortOrder: "created_at",
      now: "2026-03-09T10:10:00.000Z",
      delegatedUnderParent: new Set(),
    });

    expect(fallbackThreadId).toBe(ThreadId.make("thread-next"));
  });

  it.each([
    [
      "snoozed",
      { snoozedUntil: "2099-01-01T00:00:00.000Z", snoozedAt: "2026-03-09T10:06:00.000Z" },
    ],
    ["delegated", { id: ThreadId.make("thread-delegated") }],
    ["settled", { settledOverride: "settled", settledAt: "2026-03-09T10:06:00.000Z" }],
    [
      "side chat",
      {
        lineage: {
          rootThreadId: ThreadId.make("thread-visible"),
          parentThreadId: ThreadId.make("thread-visible"),
          relationshipToParent: "fork",
          sideChat: true,
        },
      },
    ],
    [
      "subagent",
      {
        lineage: {
          rootThreadId: ThreadId.make("thread-visible"),
          parentThreadId: ThreadId.make("thread-visible"),
          relationshipToParent: "subagent",
        },
      },
    ],
  ] as const)("skips a %s thread the sidebar does not list", (_state, parked) => {
    const fallbackThreadId = getFallbackThreadIdAfterDelete({
      threads: [
        makeThread({
          id: ThreadId.make("thread-visible"),
          createdAt: "2026-03-09T10:01:00.000Z",
          updatedAt: "2026-03-09T10:01:00.000Z",
        }),
        makeThread({
          id: ThreadId.make("thread-parked"),
          createdAt: "2026-03-09T10:02:00.000Z",
          updatedAt: "2026-03-09T10:06:00.000Z",
          ...parked,
        }),
        makeThread({
          id: ThreadId.make("thread-active"),
          createdAt: "2026-03-09T10:03:00.000Z",
          updatedAt: "2026-03-09T10:03:00.000Z",
        }),
      ],
      deletedThreadId: ThreadId.make("thread-active"),
      sortOrder: "created_at",
      now: "2026-03-09T10:10:00.000Z",
      delegatedUnderParent: new Set([
        threadKey({
          environmentId: localEnvironmentId,
          threadId: ThreadId.make("thread-delegated"),
        }),
      ]),
    });

    expect(fallbackThreadId).toBe(ThreadId.make("thread-visible"));
  });
});

describe("sortScopedProjectsForSidebar", () => {
  it("keeps identical project ids in different environments separate", () => {
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const sharedProjectId = ProjectId.make("shared-project");
    const projects = [
      makeProject({
        environmentId: localEnvironmentId,
        id: sharedProjectId,
        title: "Local project",
      }),
      makeProject({
        environmentId: remoteEnvironmentId,
        id: sharedProjectId,
        title: "Remote project",
      }),
    ];
    const threads = [
      makeThread({
        environmentId: localEnvironmentId,
        projectId: sharedProjectId,
        updatedAt: "2026-03-09T10:02:00.000Z",
      }),
      makeThread({
        environmentId: remoteEnvironmentId,
        projectId: sharedProjectId,
        updatedAt: "2026-03-09T10:10:00.000Z",
      }),
    ];

    const sorted = sortScopedProjectsForSidebar(projects, threads, "updated_at");

    expect(sorted.map((project) => project.title)).toEqual(["Remote project", "Local project"]);
  });

  it("does not use archived threads as project activity", () => {
    const projects = [
      makeProject({
        id: ProjectId.make("project-visible"),
        title: "Visible project",
        updatedAt: "2026-03-09T10:01:00.000Z",
      }),
      makeProject({
        id: ProjectId.make("project-archived"),
        title: "Archived-only project",
        updatedAt: "2026-03-09T10:00:00.000Z",
      }),
    ];
    const threads = [
      makeThread({
        id: ThreadId.make("thread-visible"),
        projectId: ProjectId.make("project-visible"),
        updatedAt: "2026-03-09T10:02:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("thread-archived"),
        projectId: ProjectId.make("project-archived"),
        updatedAt: "2026-03-09T10:10:00.000Z",
        archivedAt: "2026-03-09T10:11:00.000Z",
      }),
    ];

    const sorted = sortScopedProjectsForSidebar(projects, threads, "updated_at");

    expect(sorted.map((project) => project.title)).toEqual([
      "Visible project",
      "Archived-only project",
    ]);
  });
});

describe("sortSidebarV2ProjectGroups", () => {
  it("does not let a hidden subagent thread reorder projects", () => {
    const olderProjectId = ProjectId.make("project-older");
    const newerProjectId = ProjectId.make("project-newer");
    const olderRootThreadId = ThreadId.make("thread-older-root");
    const projects = [
      {
        ...makeProject({ id: olderProjectId, title: "A older project" }),
        projectKey: "logical-older",
        memberProjectRefs: [{ environmentId: localEnvironmentId, projectId: olderProjectId }],
      },
      {
        ...makeProject({ id: newerProjectId, title: "Z newer project" }),
        projectKey: "logical-newer",
        memberProjectRefs: [{ environmentId: localEnvironmentId, projectId: newerProjectId }],
      },
    ];
    const threads = [
      makeThread({
        id: olderRootThreadId,
        projectId: olderProjectId,
        updatedAt: "2026-03-09T10:01:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("thread-newer-root"),
        projectId: newerProjectId,
        updatedAt: "2026-03-09T10:05:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("thread-hidden-subagent"),
        projectId: olderProjectId,
        updatedAt: "2026-03-09T10:10:00.000Z",
        lineage: {
          rootThreadId: olderRootThreadId,
          parentThreadId: olderRootThreadId,
          relationshipToParent: "subagent",
        },
      }),
    ];

    expect(
      sortSidebarV2ProjectGroups(projects, threads, "updated_at", new Set()).map(
        (project) => project.projectKey,
      ),
    ).toEqual(["logical-newer", "logical-older"]);
  });
});

describe("pinOrderKeyBetween", () => {
  it("stays strictly ordered under repeated top insertion", () => {
    let head: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 100; i += 1) {
      const key: string = pinOrderKeyBetween(null, head)!;
      expect(key).not.toBeNull();
      if (head !== null) expect(key < head).toBe(true);
      keys.push(key);
      head = key;
    }
    expect(new Set(keys).size).toBe(100);
  });

  it("stays strictly ordered under repeated middle insertion", () => {
    let low = pinOrderKeyBetween(null, null)!;
    let high = pinOrderKeyBetween(low, null)!;
    for (let i = 0; i < 100; i += 1) {
      const key: string = pinOrderKeyBetween(low, high)!;
      expect(low < key && key < high).toBe(true);
      if (i % 2 === 0) low = key;
      else high = key;
    }
  });

  it("returns null for corrupt or out-of-order bounds instead of throwing", () => {
    expect(pinOrderKeyBetween("z", "a")).toBeNull();
    expect(pinOrderKeyBetween("A!", null)).toBeNull();
    expect(pinOrderKeyBetween(null, "ma")).toBeNull();
    expect(pinOrderKeyBetween("m", "m")).toBeNull();
  });
});

describe("sortPinnedThreadsForSidebar", () => {
  const pinnable = (input: { id: string; createdAt: string; pinOrderKey?: string | null }) => ({
    id: input.id,
    createdAt: input.createdAt,
    pinOrderKey: input.pinOrderKey ?? null,
  });

  it("sorts keyed threads by key ahead of keyless threads in creation order", () => {
    const sorted = sortPinnedThreadsForSidebar([
      pinnable({ id: "keyless-old", createdAt: "2026-03-09T08:00:00.000Z" }),
      pinnable({ id: "second", createdAt: "2026-03-09T09:00:00.000Z", pinOrderKey: "t" }),
      pinnable({ id: "keyless-new", createdAt: "2026-03-09T12:00:00.000Z" }),
      pinnable({ id: "first", createdAt: "2026-03-09T07:00:00.000Z", pinOrderKey: "g" }),
    ]);

    expect(sorted.map((thread) => thread.id)).toEqual([
      "first",
      "second",
      "keyless-new",
      "keyless-old",
    ]);
  });

  it("breaks equal keys by id so raced writes render identically everywhere", () => {
    const sorted = sortPinnedThreadsForSidebar([
      pinnable({ id: "b", createdAt: "2026-03-09T10:00:00.000Z", pinOrderKey: "m" }),
      pinnable({ id: "a", createdAt: "2026-03-09T11:00:00.000Z", pinOrderKey: "m" }),
    ]);

    expect(sorted.map((thread) => thread.id)).toEqual(["a", "b"]);
  });
});

describe("resolveSidebarSweepKeys", () => {
  const ordered = ["a", "b", "c", "d", "blocked"];
  const canSettle = (key: string) => key !== "blocked";

  it("leaves out rows that cannot settle and rows that left the list", () => {
    expect(resolveSidebarSweepKeys(ordered, "c", "blocked", canSettle)).toEqual(["c", "d"]);
    expect(resolveSidebarSweepKeys(ordered, "gone", "a", canSettle)).toEqual([]);
  });
});

describe("navigation after parking a thread", () => {
  it.each([
    ["settle", "settled", null, "thread", true],
    ["settle", "active", null, "thread", false],
    ["settle", "settled", null, "other-thread", false],
    ["snooze", null, "2099-01-01T00:00:00.000Z", "thread", true],
    ["snooze", null, null, "thread", false],
    ["snooze", null, "2026-09-12T09:00:00.000Z", "thread", false],
    ["snooze", null, "2099-01-01T00:00:00.000Z", "thread", false, true],
    ["snooze", null, "2099-01-01T00:00:00.000Z", "other-thread", false],
  ] as const)(
    "%s with state %s / %s on %s navigates: %s",
    (
      action,
      settledOverride,
      snoozedUntil,
      currentThreadKey,
      expected,
      hasPendingApprovals: boolean = false,
    ) => {
      expect(
        shouldNavigateAfterThreadPark({
          threadKey: "thread",
          currentThreadKey,
          action,
          now: "2026-09-12T10:00:00.000Z",
          thread: {
            settledOverride,
            snoozedUntil,
            snoozedAt: null,
            session: null,
            latestTurn: null,
            hasPendingApprovals,
            hasPendingUserInput: false,
          },
        }),
      ).toBe(expected);
    },
  );
});

describe("unseen completion with background work", () => {
  it.each([
    {
      roster: "dev server",
      task: { kind: "command" },
      status: "ready",
      receded: false,
      pill: "Completed",
    },
    {
      roster: "dev server watchdog",
      task: { kind: "monitor" },
      status: "ready",
      receded: false,
      pill: "Completed",
    },
    {
      roster: "awaited command",
      task: { kind: "command", awaited: true },
      status: "waiting",
      receded: true,
      pill: "Waiting",
    },
  ] as const)("presents a completed thread with a $roster roster", (expected) => {
    const thread = presentThreadShell(localEnvironmentId, {
      ...makeThreadFixture().source,
      latestRunId: RunId.make("run-background-completion"),
      status: "completed",
      latestRunCompletedAt: DateTime.makeUnsafe("2026-06-20T01:00:00.000Z"),
      lastVisitedAt: DateTime.makeUnsafe("2026-06-20T00:59:00.000Z"),
      pendingBackgroundTasks: [{ taskId: "background-work", ...expected.task }],
    });
    const status = resolveSidebarThreadStatus(thread);
    const isUnread = hasUnseenCompletion(thread);

    expect(isUnread).toBe(true);
    expect(status).toBe(expected.status);
    expect(isSidebarThreadWorking(thread)).toBe(expected.receded);
    expect(resolveThreadStatusPill({ thread })).toMatchObject({ label: expected.pill });
  });
});

describe("Working shelf (beta)", () => {
  const runtime = {
    status: "running" as const,
    activeRunId: null,
    providerInstanceId: ProviderInstanceId.make("codex"),
    providerName: "Codex",
    lastError: null,
    updatedAt: "2026-03-09T10:00:00.000Z",
  };
  const backgroundTask = {
    taskId: "bg-1",
    description: "Watch build",
    kind: "monitor" as const,
    awaited: true as const,
  };
  const idle = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default" as const,
    latestRun: makeLatestRun(),
    runtime: null,
  };
  const waiting = {
    ...idle,
    runtime: { ...runtime, status: "idle" as const },
    pendingBackgroundTasks: [backgroundTask],
  };

  it("folds away running threads and threads waiting on background work only", () => {
    expect(isSidebarThreadWorking({ ...idle, runtime })).toBe(true);
    expect(isSidebarThreadWorking(waiting)).toBe(true);
    expect(isSidebarThreadWorking(idle)).toBe(false);
    expect(isSidebarThreadWorking({ ...idle, runtime, hasPendingApprovals: true })).toBe(false);
    expect(isSidebarThreadWorking({ ...idle, runtime, hasPendingUserInput: true })).toBe(false);
    expect(
      isSidebarThreadWorking({
        ...waiting,
        runtime: { ...runtime, status: "failed" as const, lastError: "boom" },
      }),
    ).toBe(false);
  });

  it("keeps a ready plan in the inbox while background work runs", () => {
    expect(
      isSidebarThreadWorking({
        ...waiting,
        interactionMode: "plan",
        hasActionableProposedPlan: true,
      }),
    ).toBe(false);
  });

  describe("sortInboxThreadsByReturn", () => {
    const thread = (
      id: string,
      input: { createdAt: string; completedAt?: string | null; unsettledAt?: string },
    ) => ({
      id: ThreadId.make(id),
      environmentId: localEnvironmentId,
      createdAt: input.createdAt,
      unsettledAt: input.unsettledAt ?? null,
      latestRun:
        input.completedAt === undefined
          ? null
          : { ...makeLatestRun({ completedAt: input.completedAt }), requestedAt: input.createdAt },
    });

    it("puts the thread that finished last on top, whatever its age", () => {
      const sorted = sortInboxThreadsByReturn([
        thread("new", { createdAt: "2026-03-09T11:00:00.000Z" }),
        thread("old-finished-now", {
          createdAt: "2026-03-01T09:00:00.000Z",
          completedAt: "2026-03-09T12:00:00.000Z",
        }),
        thread("reopened", {
          createdAt: "2026-03-02T09:00:00.000Z",
          unsettledAt: "2026-03-09T11:30:00.000Z",
        }),
      ]);
      expect(sorted.map((entry) => entry.id)).toEqual(["old-finished-now", "reopened", "new"]);
    });

    it("counts a return the server does not stamp, like an approval request", () => {
      const waiting = thread("asks-approval", {
        createdAt: "2026-03-09T09:00:00.000Z",
        completedAt: null,
      });
      const finished = thread("finished", {
        createdAt: "2026-03-09T09:30:00.000Z",
        completedAt: "2026-03-09T11:00:00.000Z",
      });
      expect(sortInboxThreadsByReturn([finished, waiting]).map((entry) => entry.id)).toEqual([
        "finished",
        "asks-approval",
      ]);
      expect(
        sortInboxThreadsByReturn([finished, waiting], (entry) =>
          entry === waiting ? Date.parse("2026-03-09T11:05:00.000Z") : undefined,
        ).map((entry) => entry.id),
      ).toEqual(["asks-approval", "finished"]);
    });
  });

  describe("dragging", () => {
    const marker = (name: SidebarListMarker): SidebarListItem => ({ kind: "marker", marker: name });
    const row = (key: string, section: SidebarSection): SidebarListItem => ({
      kind: "thread",
      key,
      section,
    });
    const items: readonly SidebarListItem[] = [
      marker("pinned-header"),
      row("p1", "pinned"),
      marker("working-header"),
      row("w1", "working"),
      marker("review-header"),
      row("r1", "review"),
      marker("pinned-divider"),
      row("a1", "active"),
      row("a2", "active"),
      marker("settled-header"),
      row("s1", "settled"),
    ];

    it("never drops into Working or To review, and keeps them out of the inbox order", () => {
      expect(resolveSidebarDropTarget(items, "a1", "w1")).toBeNull();
      expect(resolveSidebarDropTarget(items, "a1", "r1")).toBeNull();
      expect(resolveSidebarDropTarget(items, "p1", "a2")).toEqual({
        section: "active",
        pinnedOrder: [],
        activeOrder: ["a1", "a2", "p1"],
      });
      expect(resolveSidebarDropVerb("active", "working")).toBeNull();
      expect(resolveSidebarDropVerb("active", "review")).toBeNull();
    });

    it("lets a To review row pin or settle like any active thread", () => {
      expect(resolveSidebarDropVerb("review", "pinned")).toBe("pin");
      expect(resolveSidebarDropVerb("review", "settled")).toBe("settle");
      expect(resolveSidebarDropVerb("review", "active")).toBeNull();
      const plan = (overKey: string) =>
        planSidebarThreadDrop({
          activeKey: "r1",
          activeSection: "review",
          target: resolveSidebarDropTarget(items, "r1", overKey)!,
          pinnedOrder: ["p1"],
          pinnedKeysById: new Map([["p1", "m"]]),
          activeOrder: ["a1", "a2"],
          activeKeysById: new Map(),
          activeTimeOrdered: true,
        });
      expect(plan("s1")).toEqual({ kind: "settle" });
      expect(plan("a2")).toEqual({ kind: "none" });
      expect(plan("p1").kind).toBe("pin");
    });

    it.each([
      ["pinned", "p1"],
      ["active", "a2"],
      ["settled", "s1"],
    ] as const)(
      "does not move a Working thread into %s when its reference drag ends in the sidebar",
      (section, overKey) => {
        const target = resolveSidebarDropTarget(items, "w1", overKey);
        expect(target?.section).toBe(section);
        expect(
          planSidebarThreadDrop({
            activeKey: "w1",
            activeSection: "working",
            target: target!,
            pinnedOrder: ["p1"],
            pinnedKeysById: new Map([["p1", "m"]]),
            activeOrder: ["a1", "a2"],
            activeKeysById: new Map([
              ["a1", "f"],
              ["a2", "t"],
            ]),
            activeTimeOrdered: true,
          }),
        ).toEqual({ kind: "none" });
      },
    );

    it("arranges the rows it can write when another row's server cannot store an order", () => {
      const plan = planSidebarThreadDrop({
        activeKey: "a2",
        activeSection: "active",
        target: {
          section: "active",
          pinnedOrder: [],
          activeOrder: ["offline", "a2", "a1"],
        },
        pinnedOrder: [],
        pinnedKeysById: new Map(),
        activeOrder: ["offline", "a1", "a2"],
        activeKeysById: new Map([
          ["offline", null],
          ["a1", null],
          ["a2", null],
        ]),
        activeReorderableKeys: new Set(["a1", "a2"]),
      });
      expect(plan.kind).toBe("move-active");
      if (plan.kind !== "move-active") return;
      expect(plan.assignments.map(({ id }) => id)).toEqual(["a2", "a1"]);
      const [a2, a1] = plan.assignments.map(({ orderKey }) => orderKey);
      expect(a2! < a1!).toBe(true);

      const above = planSidebarThreadDrop({
        activeKey: "a2",
        activeSection: "active",
        target: { section: "active", pinnedOrder: [], activeOrder: ["a2", "offline"] },
        pinnedOrder: [],
        pinnedKeysById: new Map(),
        activeOrder: ["offline", "a2"],
        activeKeysById: new Map([
          ["offline", "m"],
          ["a2", "t"],
        ]),
        activeReorderableKeys: new Set(["a2"]),
      });
      expect(above.kind === "move-active" && above.assignments[0]!.orderKey < "m").toBe(true);
    });

    describe("reordering with cached offline configuration", () => {
      const onlineEnvironmentId = EnvironmentId.make("online");
      const offlineEnvironmentId = EnvironmentId.make("offline");
      const capabilities = {
        repositoryIdentity: true,
        threadPinning: true,
        threadPinReorder: true,
        threadActiveReorder: true,
      };
      const config = (environmentId: EnvironmentId) => ({
        environment: {
          environmentId,
          label: environmentId,
          platform: { os: "linux" as const, arch: "x64" as const },
          serverVersion: "0.1.1",
          capabilities,
        },
      });
      const serverConfigs = new Map([
        [onlineEnvironmentId, config(onlineEnvironmentId)],
        [offlineEnvironmentId, config(offlineEnvironmentId)],
      ]);
      const thread = (
        id: string,
        environmentId = onlineEnvironmentId,
        key: string | null = null,
      ) => ({
        id: ThreadId.make(id),
        environmentId,
        createdAt: `2026-03-09T${id === "offline" ? "12" : id === "online" ? "11" : "10"}:00:00.000Z`,
        activeOrderKey: key,
        pinOrderKey: key,
      });
      const keyOf = (entry: ReturnType<typeof thread>) =>
        scopedThreadKey(scopeThreadRef(entry.environmentId, entry.id));
      const online = thread("online");
      const offline = thread("offline", offlineEnvironmentId);
      const membership = (connectedEnvironmentIds = [onlineEnvironmentId]) =>
        resolveSidebarReorderableThreadKeys({
          threads: [online, offline],
          serverConfigs,
          connectedEnvironmentIds,
        });
      const planDrop = (input: {
        section: "active" | "pinned";
        rows: ReturnType<typeof thread>[];
        moved: ReturnType<typeof thread>;
        order: ReturnType<typeof thread>[];
        from?: "active" | "pinned";
        connectedEnvironmentIds?: EnvironmentId[];
      }) => {
        const writable = resolveSidebarReorderableThreadKeys({
          threads: input.rows,
          serverConfigs,
          connectedEnvironmentIds: input.connectedEnvironmentIds ?? [onlineEnvironmentId],
        });
        const sort = (rows: typeof input.rows) =>
          input.section === "active"
            ? sortActiveThreadsByOrderKey(rows)
            : sortPinnedThreadsByOrderKey(rows);
        const originalOrder = sort(input.rows).map(keyOf);
        const targetOrder = input.order.map(keyOf);
        const keysById = new Map(
          input.rows.map((entry) => [
            keyOf(entry),
            input.section === "active" ? activeThreadSortKey(entry) : entry.pinOrderKey,
          ]),
        );
        const plan = planSidebarThreadDrop({
          activeKey: keyOf(input.moved),
          activeSection: input.from ?? input.section,
          target: { section: input.section, pinnedOrder: targetOrder, activeOrder: targetOrder },
          pinnedOrder: originalOrder,
          activeOrder: originalOrder,
          pinnedKeysById: keysById,
          activeKeysById: keysById,
          reorderableKeys: writable.draggableThreadKeys,
          activeReorderableKeys: writable.activeReorderableThreadKeys,
        });
        const assignments =
          plan.kind === "move-active" || plan.kind === "reorder-pinned"
            ? plan.assignments
            : plan.kind === "pin"
              ? [
                  ...plan.extraAssignments,
                  ...(plan.orderKey === undefined
                    ? []
                    : [{ id: keyOf(input.moved), orderKey: plan.orderKey }]),
                ]
              : [];
        const assignedKeys = new Map(assignments.map(({ id, orderKey }) => [id, orderKey]));
        const actualOrder = sort(
          input.rows.map((entry) => ({
            ...entry,
            activeOrderKey: assignedKeys.get(keyOf(entry)) ?? entry.activeOrderKey,
            pinOrderKey: assignedKeys.get(keyOf(entry)) ?? entry.pinOrderKey,
          })),
        ).map(keyOf);

        return { plan, assignments, actualOrder, targetOrder };
      };

      it("excludes cached capable offline rows from both writable sets", () => {
        const writable = membership();

        expect([...writable.draggableThreadKeys]).toEqual([keyOf(online)]);
        expect([...writable.activeReorderableThreadKeys]).toEqual([keyOf(online)]);
        expect(serverConfigs.has(offlineEnvironmentId)).toBe(true);
      });

      it("updates membership through disconnect, reconnect, and missing configuration", () => {
        expect(membership([]).draggableThreadKeys.size).toBe(0);
        const connected = membership([onlineEnvironmentId, offlineEnvironmentId]);
        expect(connected.draggableThreadKeys.size).toBe(2);
        expect(connected.activeReorderableThreadKeys.size).toBe(2);

        const changed = resolveSidebarReorderableThreadKeys({
          threads: [online, offline],
          connectedEnvironmentIds: [onlineEnvironmentId, offlineEnvironmentId],
          serverConfigs: new Map([[onlineEnvironmentId, config(onlineEnvironmentId)]]),
        });
        expect([...changed.draggableThreadKeys]).toEqual([keyOf(online)]);
        expect([...changed.activeReorderableThreadKeys]).toEqual([keyOf(online)]);
      });

      it.each(["active", "pinned"] as const)(
        "replans a disconnected drag source in %s",
        (section) => {
          const bound = thread("offline", offlineEnvironmentId, "m");
          const moved = thread("online", onlineEnvironmentId, "t");
          const input = { section, rows: [bound, moved], moved, order: [moved, bound] };
          expect(planDrop(input).plan.kind).toBe(
            section === "active" ? "move-active" : "reorder-pinned",
          );

          const disconnected = planDrop({ ...input, connectedEnvironmentIds: [] });

          expect(disconnected.plan).toEqual({ kind: "none" });
          expect(disconnected.assignments).toEqual([]);
        },
      );

      it.each(["active", "pinned"] as const)("preserves a keyed offline bound in %s", (section) => {
        const bound = thread("offline", offlineEnvironmentId, "m");
        const moved = thread("online", onlineEnvironmentId, "t");
        const result = planDrop({ section, rows: [bound, moved], moved, order: [moved, bound] });

        expect(result.plan.kind).toBe(section === "active" ? "move-active" : "reorder-pinned");
        expect(result.assignments.map(({ id }) => id)).toEqual([keyOf(moved)]);
        expect(result.actualOrder).toEqual(result.targetOrder);
      });

      it("rejects rebalancing a keyed offline bound in pinned", () => {
        const bound = thread("offline", offlineEnvironmentId, "m");
        const neighbor = thread("neighbor");
        const result = planDrop({
          section: "pinned",
          rows: [bound, online, neighbor],
          moved: online,
          order: [bound, neighbor, online],
        });

        expect(result.plan).toEqual({ kind: "none" });
        expect(result.assignments).toEqual([]);
      });

      it("rejects crossing the frozen keyless boundary in pinned", () => {
        const bound = { ...offline, createdAt: "2026-03-09T10:00:00.000Z" };
        const result = planDrop({
          section: "pinned",
          rows: [bound, online],
          moved: online,
          order: [bound, online],
        });

        expect(result.plan).toEqual({ kind: "none" });
        expect(result.assignments).toEqual([]);
      });

      it.each([
        ["an unarranged", null],
        ["an arranged", "m"],
      ] as const)("moves %s thread anywhere around an offline one in active", (_, key) => {
        const neighbor = thread("neighbor");
        const moved = {
          ...thread("moved", onlineEnvironmentId, key),
          createdAt: "2026-03-09T09:00:00.000Z",
        };
        const rows = [offline, neighbor, moved];
        for (const order of [
          [moved, offline, neighbor],
          [offline, moved, neighbor],
        ]) {
          const result = planDrop({ section: "active", rows, moved, order });
          expect(result.assignments.map(({ id }) => id)).toEqual([keyOf(moved)]);
          expect(result.actualOrder).toEqual(result.targetOrder);
        }
      });

      it.each(["active", "pinned"] as const)(
        "allows realizable moves beside a frozen keyless row in %s",
        (section) => {
          const neighbor = thread("neighbor");
          const order =
            section === "active" ? [offline, neighbor, online] : [online, neighbor, offline];
          const result = planDrop({
            section,
            rows: [offline, online, neighbor],
            moved: online,
            order,
          });

          expect(result.plan.kind).toBe(section === "active" ? "move-active" : "reorder-pinned");
          expect(result.assignments.length).toBeGreaterThan(0);
          expect(result.assignments.every(({ id }) => id !== keyOf(offline))).toBe(true);
          expect(result.actualOrder).toEqual(result.targetOrder);
        },
      );

      it("checks fallback assignments to other rows at the pinned boundary", () => {
        const neighbor = thread("neighbor");
        const result = planDrop({
          section: "pinned",
          rows: [offline, online, neighbor],
          moved: online,
          order: [online, offline, neighbor],
        });

        expect(result.plan).toEqual({ kind: "none" });
      });

      it("rejects impossible pin placement across the pinned boundary", () => {
        const result = planDrop({
          section: "pinned",
          rows: [offline, online],
          moved: online,
          order: [offline, online],
          from: "active",
        });

        expect(result.plan).toEqual({ kind: "none" });
      });

      it("unpins a thread above an offline one in active", () => {
        const result = planDrop({
          section: "active",
          rows: [offline, online],
          moved: online,
          order: [online, offline],
          from: "pinned",
        });

        expect(result.assignments.map(({ id }) => id)).toEqual([keyOf(online)]);
        expect(result.actualOrder).toEqual(result.targetOrder);
      });
    });

    it("only changes lifecycle when the inbox is time-ordered", () => {
      const base = {
        pinnedOrder: ["p1"],
        pinnedKeysById: new Map([["p1", "m"]]),
        activeOrder: ["a1", "a2"],
        activeKeysById: new Map([
          ["a1", "f"],
          ["a2", "t"],
        ]),
        activeTimeOrdered: true,
      };
      expect(
        planSidebarThreadDrop({
          ...base,
          activeKey: "a1",
          activeSection: "active",
          target: { section: "active", pinnedOrder: ["p1"], activeOrder: ["a2", "a1"] },
        }),
      ).toEqual({ kind: "none" });
      expect(
        planSidebarThreadDrop({
          ...base,
          activeKey: "p1",
          activeSection: "pinned",
          target: { section: "active", pinnedOrder: [], activeOrder: ["a1", "p1", "a2"] },
        }),
      ).toEqual({
        kind: "move-active",
        order: null,
        assignments: [],
        unpin: true,
        unsettle: false,
        unsnooze: false,
      });
    });
  });
});

describe("pendingSidebarRouteReveal", () => {
  it("keeps a revealed thread settled across a mount that reads no route params", () => {
    const reveal = { observedKey: null, pendingKey: null };
    expect(pendingSidebarRouteReveal(reveal, "env:a1")).toBe("env:a1");
    completeSidebarRouteReveal(reveal);

    // Back from Settings: location commits before the thread match does.
    expect(pendingSidebarRouteReveal(reveal, null)).toBeNull();
    expect(pendingSidebarRouteReveal(reveal, "env:a1")).toBeNull();

    expect(pendingSidebarRouteReveal(reveal, "env:b1")).toBe("env:b1");
  });

  it("keeps a pending reveal through a render without route params", () => {
    const reveal = { observedKey: null, pendingKey: null };
    pendingSidebarRouteReveal(reveal, "env:a1");
    expect(pendingSidebarRouteReveal(reveal, null)).toBeNull();
    expect(pendingSidebarRouteReveal(reveal, "env:a1")).toBe("env:a1");
  });
});

describe("resolveSidebarRouteReveal", () => {
  const routeKey = "environment-test:thread-test";
  const resolve = (
    reveal: SidebarRouteReveal,
    options: {
      readonly routeKey?: string;
      readonly routeRailKey?: string | null;
      readonly selectedRailKey?: string;
      readonly isSearching?: boolean;
    } = {},
  ) =>
    resolveSidebarRouteReveal({
      reveal,
      routeKey: options.routeKey ?? routeKey,
      routeKeyInPlace: false,
      isSearching: options.isSearching ?? false,
      routeRailKey: options.routeRailKey === undefined ? "web" : options.routeRailKey,
      selectedRailKey: options.selectedRailKey ?? "api",
    });

  it("follows a newly opened thread that lists under another project", () => {
    expect(resolve({ observedKey: "environment-test:other", pendingKey: null })).toEqual({
      followsRoute: true,
      settledRailKey: "web",
    });
  });

  it("never follows a thread whose reveal already completed", () => {
    // A remount's once-per-mount scroll must keep the project the user chose.
    expect(resolve({ observedKey: routeKey, pendingKey: null })).toEqual({
      followsRoute: false,
      settledRailKey: null,
    });
  });

  it("settles the route's project even while it is already selected", () => {
    // An open draft is already in the selected project and has no row to complete its scroll.
    const reveal: SidebarRouteReveal = { observedKey: null, pendingKey: null };
    expect(resolve(reveal, { selectedRailKey: "web" })).toEqual({
      followsRoute: false,
      settledRailKey: "web",
    });
    completeSidebarProjectReveal(reveal);
    expect(reveal.pendingKey).toBe(routeKey);
    // Picking another project afterwards is not undone.
    expect(resolve(reveal, { selectedRailKey: "api" })).toEqual({
      followsRoute: false,
      settledRailKey: null,
    });
  });

  it("drops a reveal still waiting to place its project once the user picks one", () => {
    const reveal: SidebarRouteReveal = { observedKey: null, pendingKey: null };
    expect(resolve(reveal, { routeRailKey: null })).toEqual({
      followsRoute: false,
      settledRailKey: null,
    });
    completeSidebarProjectReveal(reveal);
    expect(resolve(reveal)).toEqual({ followsRoute: false, settledRailKey: null });
  });

  it("follows again for a thread reopened before the thread between them listed its row", () => {
    // The user picked another project, then went to a thread whose row never mounted,
    // then came back.
    const reveal: SidebarRouteReveal = { observedKey: routeKey, pendingKey: null };
    resolve(reveal, { routeKey: "environment-test:unlisted", routeRailKey: null });
    expect(resolve(reveal)).toEqual({ followsRoute: true, settledRailKey: "web" });
  });

  it("waits for a restored draft's projects before settling its project", () => {
    // The draft's environment has not loaded its projects, so its project reads as one no
    // group holds and lands under the entry for threads without a project.
    const draftProject = { environmentId: "env", projectId: "web" };
    const before = [
      { key: "api", projectKeys: new Set(["env:api"]) },
      { key: SIDEBAR_UNASSIGNED_RAIL_KEY, projectKeys: new Set(["env:scratch", "env:web"]) },
    ];
    const reveal: SidebarRouteReveal = { observedKey: null, pendingKey: null };
    const routeRailKey = findSidebarRailEntryKey(before, draftProject, false);
    expect(routeRailKey).toBeNull();
    expect(resolve(reveal, { routeRailKey, selectedRailKey: "api" })).toEqual({
      followsRoute: false,
      settledRailKey: null,
    });
    const after = [{ key: "web", projectKeys: new Set(["env:web"]) }, ...before];
    expect(
      resolve(reveal, {
        routeRailKey: findSidebarRailEntryKey(after, draftProject, true),
        selectedRailKey: "api",
      }),
    ).toEqual({ followsRoute: true, settledRailKey: "web" });
  });

  it("holds a pending reveal without following while searching", () => {
    const reveal: SidebarRouteReveal = { observedKey: null, pendingKey: null };
    expect(resolve(reveal, { isSearching: true })).toEqual({
      followsRoute: false,
      settledRailKey: null,
    });
    expect(resolve(reveal)).toEqual({ followsRoute: true, settledRailKey: "web" });
  });
});

describe("resolveSidebarInboxGroup", () => {
  it("keeps a thread waiting on the user in Working, ahead of its unseen results", () => {
    expect(resolveSidebarInboxGroup({ working: false, needsUser: true, unseen: true })).toBe(
      "working",
    );
    expect(resolveSidebarInboxGroup({ working: true, needsUser: false, unseen: true })).toBe(
      "working",
    );
  });

  it("lists finished unseen threads under To review and the rest under Earlier", () => {
    expect(resolveSidebarInboxGroup({ working: false, needsUser: false, unseen: true })).toBe(
      "review",
    );
    expect(resolveSidebarInboxGroup({ working: false, needsUser: false, unseen: false })).toBe(
      "active",
    );
  });
});

describe("sidebarThreadNeedsUser", () => {
  const quiet = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    pendingGuestMessageCount: 0,
    interactionMode: "default" as const,
    latestRun: makeLatestRun(),
    runtime: null,
  };
  const readyPlan = { ...quiet, interactionMode: "plan" as const, hasActionableProposedPlan: true };
  it("is true for approvals, questions, subagent requests and guest messages", () => {
    expect(sidebarThreadNeedsUser(quiet)).toBe(false);
    expect(sidebarThreadNeedsUser({ ...quiet, hasPendingApprovals: true })).toBe(true);
    expect(sidebarThreadNeedsUser({ ...quiet, hasPendingUserInput: true })).toBe(true);
    expect(sidebarThreadNeedsUser({ ...quiet, pendingSubagentRequest: "approval" })).toBe(true);
    expect(sidebarThreadNeedsUser({ ...quiet, pendingGuestMessageCount: 1 })).toBe(true);
  });

  it("holds a finished plan awaiting the user's decision after it has been seen", () => {
    expect(isSidebarThreadWorking(readyPlan)).toBe(false);
    expect(sidebarThreadNeedsUser(readyPlan)).toBe(true);
    expect(
      resolveSidebarInboxGroup({
        working: isSidebarThreadWorking(readyPlan),
        needsUser: sidebarThreadNeedsUser(readyPlan),
        unseen: false,
      }),
    ).toBe("working");
    expect(resolveThreadStatusPill({ thread: readyPlan })).toMatchObject({ label: "Plan Ready" });
    // A plan still being written, or a failed run, does not wait on a decision.
    expect(
      sidebarThreadNeedsUser({
        ...readyPlan,
        latestRun: { ...makeLatestRun({ completedAt: null }), status: "running" },
      }),
    ).toBe(false);
    expect(
      sidebarThreadNeedsUser({ ...readyPlan, latestRun: { ...makeLatestRun(), status: "failed" } }),
    ).toBe(false);
  });
});

describe("isSidebarThreadUnseen", () => {
  const base = {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default" as const,
    latestRun: makeLatestRun(),
    runtime: null,
  };
  it("counts a completion after the last visit", () => {
    expect(
      isSidebarThreadUnseen({ ...base, lastVisitedAt: "2026-03-09T10:04:00.000Z" }, null),
    ).toBe(true);
    expect(
      isSidebarThreadUnseen({ ...base, lastVisitedAt: "2026-03-09T10:06:00.000Z" }, null),
    ).toBe(false);
  });

  it("counts a snooze that woke after the last visit", () => {
    const visited = { ...base, lastVisitedAt: "2026-03-09T10:06:00.000Z" };
    expect(isSidebarThreadUnseen(visited, "2026-03-09T11:00:00.000Z")).toBe(true);
    expect(isSidebarThreadUnseen(visited, "2026-03-09T10:00:00.000Z")).toBe(false);
  });
});

describe("buildSidebarRailEntries", () => {
  const remoteEnvironmentId = EnvironmentId.make("environment-remote");
  const repositoryIdentity = {
    canonicalKey: "github.com/acme/s1code",
    locator: {
      source: "git-remote" as const,
      remoteName: "origin",
      remoteUrl: "https://github.com/acme/s1code.git",
    },
    displayName: "acme/s1code",
  };
  const project = (id: string, overrides: Partial<Project> = {}) =>
    makeProject({ id: ProjectId.make(id), title: id, workspaceRoot: `/repo/${id}`, ...overrides });
  // As the sidebar groups them: scratch projects form one "No project" group.
  const groups = buildSidebarProjectSnapshots({
    projects: [
      project("s1code", { repositoryIdentity }),
      project("s1code-remote", { environmentId: remoteEnvironmentId, repositoryIdentity }),
      project("fleet"),
      project("old", { archivedAt: "2026-03-01T00:00:00.000Z" }),
      project("scratch-1", { workspaceRoot: "/scratch/1", isScratch: true }),
    ],
    groupScratchProjects: true,
    settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
    primaryEnvironmentId: localEnvironmentId,
    resolveEnvironmentLabel: () => null,
  });
  const thread = (
    id: string,
    projectId: string,
    options: { settled?: boolean; status?: "waiting" | "running" | null } = {},
  ) => ({
    id,
    environmentId: localEnvironmentId as string,
    projectId,
    settled: options.settled ?? false,
    status: options.status ?? null,
  });
  const build = (threads: ReturnType<typeof thread>[], heldProjectKeys: string[] = []) =>
    buildSidebarRailEntries({
      groups: [...pickableProjectGroups(groups), ...groups.filter((group) => group.archived)],
      threads,
      isListed: (entry) => !entry.settled,
      statusOf: (entry) => entry.status,
      heldProjectKeys,
    });
  const titles = (entries: ReturnType<typeof build>) =>
    entries.map((entry) => entry.group?.title ?? SIDEBAR_UNASSIGNED_RAIL_KEY);

  it("keeps open projects in order and an archived one while it holds anything", () => {
    expect(titles(build([]))).toEqual(["s1code", "fleet"]);
    // Settling its last active thread leaves the project on the rail with its Settled shelf.
    expect(titles(build([thread("a", "old", { settled: true })]))).toEqual([
      "s1code",
      "fleet",
      "old",
    ]);
    // A draft, or settled history not loaded yet, holds it too.
    expect(titles(build([], [`${localEnvironmentId}:old`]))).toEqual(["s1code", "fleet", "old"]);
    expect(build([])[0]!.projectKeys).toEqual(
      new Set([`${localEnvironmentId}:s1code`, `${remoteEnvironmentId}:s1code-remote`]),
    );
  });

  it("lists threads in a scratch project and in no known project under one entry", () => {
    const scratch = build([thread("a", "scratch-1")]);
    expect(titles(scratch)).toEqual(["s1code", "fleet", SIDEBAR_UNASSIGNED_RAIL_KEY]);
    expect(scratch.at(-1)!.group).toBeNull();
    expect(scratch.at(-1)!.projectKeys).toEqual(new Set([`${localEnvironmentId}:scratch-1`]));

    const both = build([thread("a", "scratch-1", { settled: true }), thread("b", "deleted")]);
    expect(both.at(-1)!.projectKeys).toEqual(
      new Set([`${localEnvironmentId}:scratch-1`, `${localEnvironmentId}:deleted`]),
    );
    // The entry stays for a draft without a project and leaves with its last thread.
    expect(titles(build([], [`${localEnvironmentId}:scratch-1`])).at(-1)).toBe(
      SIDEBAR_UNASSIGNED_RAIL_KEY,
    );
  });

  it("scopes search to every project an entry holds, including ones with no loaded rows", () => {
    const scratchGroups = buildSidebarProjectSnapshots({
      projects: [
        project("fleet"),
        project("scratch-1", { workspaceRoot: "/scratch/1", isScratch: true }),
        project("scratch-2", { workspaceRoot: "/scratch/2", isScratch: true }),
      ],
      groupScratchProjects: true,
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: () => null,
    });
    // Only scratch-1's older settled threads hold the entry; scratch-2 has a loaded row.
    const entries = buildSidebarRailEntries({
      groups: scratchGroups,
      threads: [thread("a", "scratch-2", { settled: true })],
      isListed: (entry) => !entry.settled,
      statusOf: () => null,
      heldProjectKeys: [`${localEnvironmentId}:scratch-1`],
    });
    expect(sidebarRailEntryProjectIds(entries.at(-1)!, [localEnvironmentId]).toSorted()).toEqual([
      "scratch-1",
      "scratch-2",
    ]);
  });

  it("badges a project while a thread runs, and amber while one waits on the user", () => {
    const status = (threads: ReturnType<typeof thread>[]) =>
      build(threads).find((entry) => entry.group?.title === "s1code")?.status;
    expect(status([thread("a", "s1code")])).toBeNull();
    expect(status([thread("a", "s1code", { status: "running" })])).toBe("running");
    expect(
      status([
        thread("a", "s1code", { status: "running" }),
        thread("b", "s1code", { status: "waiting" }),
        thread("c", "s1code", { status: "running" }),
      ]),
    ).toBe("waiting");
    // Settled threads list only under Settled, so they never badge the rail.
    expect(status([thread("a", "s1code", { status: "running", settled: true })])).toBeNull();
  });
});

describe("resolveSidebarRailSelection", () => {
  const entries = [{ key: "s1code" }, { key: "fleet" }];
  it("keeps the stored project, then the open thread's, then the first", () => {
    expect(resolveSidebarRailSelection({ entries, storedKey: "fleet", routeKey: "s1code" })).toBe(
      "fleet",
    );
    expect(resolveSidebarRailSelection({ entries, storedKey: "gone", routeKey: "fleet" })).toBe(
      "fleet",
    );
    expect(resolveSidebarRailSelection({ entries, storedKey: null, routeKey: null })).toBe(
      "s1code",
    );
    expect(resolveSidebarRailSelection({ entries: [], storedKey: "fleet", routeKey: null })).toBe(
      null,
    );
  });

  it("restores a stored No project selection on the entry for threads without a project", () => {
    const scratch = makeProject({
      id: ProjectId.make("scratch-1"),
      workspaceRoot: "/scratch/1",
      isScratch: true,
    });
    const groups = buildSidebarProjectSnapshots({
      projects: [makeProject({ id: ProjectId.make("fleet") }), scratch],
      groupScratchProjects: true,
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: () => null,
    });
    const railEntries = buildSidebarRailEntries({
      groups,
      threads: [{ environmentId: localEnvironmentId, projectId: scratch.id }],
      isListed: () => true,
      statusOf: () => null,
      heldProjectKeys: [],
    });
    // The folder sidebar stored the grouped key, or a scratch project's own key.
    for (const key of ["\0no-project", derivePhysicalProjectKey(scratch)]) {
      const storedKey = resolveStoredSidebarRailKey({ groups, key, canClearMissingScope: true });
      expect(storedKey).toBe(SIDEBAR_UNASSIGNED_RAIL_KEY);
      expect(resolveSidebarRailSelection({ entries: railEntries, storedKey, routeKey: null })).toBe(
        SIDEBAR_UNASSIGNED_RAIL_KEY,
      );
    }
  });

  it("maps the stored No project key to the unassigned entry when no scratch group is left", () => {
    const groups = buildSidebarProjectSnapshots({
      projects: [makeProject({ id: ProjectId.make("fleet") })],
      groupScratchProjects: true,
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: () => null,
    });
    expect(
      resolveStoredSidebarRailKey({ groups, key: "\0no-project", canClearMissingScope: true }),
    ).toBe(SIDEBAR_UNASSIGNED_RAIL_KEY);
  });

  it("finds the entry that lists a project", () => {
    const railEntries = [
      { key: "s1code", projectKeys: new Set(["env:s1code", "env-remote:s1code-remote"]) },
    ];
    expect(
      findSidebarRailEntryKey(
        railEntries,
        { environmentId: "env-remote", projectId: "s1code-remote" },
        true,
      ),
    ).toBe("s1code");
    expect(
      findSidebarRailEntryKey(railEntries, { environmentId: "env", projectId: "x" }, true),
    ).toBe(null);
    expect(findSidebarRailEntryKey(railEntries, null, true)).toBe(null);
  });
});

describe("resolveAdjacentThreadId", () => {
  it("steps from the open row, and enters the list when the open thread is not in it", () => {
    const threadIds = ["a", "b", "c"];
    expect(resolveAdjacentThreadId({ threadIds, currentThreadId: "b", direction: "next" })).toBe(
      "c",
    );
    expect(resolveAdjacentThreadId({ threadIds, currentThreadId: "c", direction: "next" })).toBe(
      null,
    );
    // Search filtered the open thread out of the results.
    for (const currentThreadId of [null, "hidden"]) {
      expect(resolveAdjacentThreadId({ threadIds, currentThreadId, direction: "next" })).toBe("a");
      expect(resolveAdjacentThreadId({ threadIds, currentThreadId, direction: "previous" })).toBe(
        "c",
      );
    }
  });
});

describe("shouldCreateNewThreadInCurrentProject", () => {
  it("opens the picker when several projects are open, or only archived ones exist", () => {
    expect(shouldCreateNewThreadInCurrentProject(false, 2, 3)).toBe(false);
    expect(shouldCreateNewThreadInCurrentProject(false, 0, 2)).toBe(false);
    expect(shouldCreateNewThreadInCurrentProject(false, 1, 3)).toBe(true);
    expect(shouldCreateNewThreadInCurrentProject(false, 0, 0)).toBe(true);
    expect(shouldCreateNewThreadInCurrentProject(true, 2, 2)).toBe(true);
  });
});

describe("resolveProjectNewThreadTarget", () => {
  const remoteEnvironmentId = EnvironmentId.make("environment-remote");
  const repositoryIdentity = {
    canonicalKey: "github.com/acme/api",
    locator: {
      source: "git-remote" as const,
      remoteName: "origin",
      remoteUrl: "https://github.com/acme/api.git",
    },
    displayName: "acme/api",
  };
  const local = makeProject({ id: ProjectId.make("api"), repositoryIdentity });
  const remote = makeProject({
    id: ProjectId.make("api-remote"),
    environmentId: remoteEnvironmentId,
    workspaceRoot: "/remote/api",
    repositoryIdentity,
  });
  const archived = "2026-03-01T00:00:00.000Z";
  const group = (projects: Project[]) =>
    buildSidebarProjectSnapshots({
      projects,
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: () => null,
    })[0]!;
  const ref = (project: Project) => ({
    environmentId: project.environmentId,
    projectId: project.id,
  });
  const viewedWeb = { environmentId: localEnvironmentId, projectId: ProjectId.make("web") };

  const loaded = () => true;

  it("starts in the selected project even while another project's thread is open", () => {
    expect(resolveProjectNewThreadTarget(group([local, remote]), viewedWeb, loaded)).toEqual(
      ref(local),
    );
    expect(resolveProjectNewThreadTarget(group([local, remote]), null, loaded)).toEqual(ref(local));
  });

  it("keeps the viewed copy while it is open, and skips an archived one", () => {
    expect(resolveProjectNewThreadTarget(group([local, remote]), ref(remote), loaded)).toEqual(
      ref(remote),
    );
    const localArchived = { ...local, archivedAt: archived };
    expect(
      resolveProjectNewThreadTarget(group([localArchived, remote]), ref(local), loaded),
    ).toEqual(ref(remote));
    expect(
      resolveProjectNewThreadTarget(
        group([localArchived, { ...remote, archivedAt: archived }]),
        ref(local),
        loaded,
      ),
    ).toBeNull();
  });

  it("waits for the environment config that says whether a project is scratch", () => {
    // Before the config, a scratch project's shell is an ordinary project on the rail.
    const scratchShell = makeProject({ id: ProjectId.make("scratch-1"), workspaceRoot: "/s/1" });
    const pending = (environmentId: EnvironmentId) => environmentId !== localEnvironmentId;
    expect(resolveProjectNewThreadTarget(group([scratchShell]), null, pending)).toBeNull();
    expect(resolveProjectNewThreadTarget(group([scratchShell]), null, loaded)).toEqual(
      ref(scratchShell),
    );
  });

  it("starts from a viewed thread in the same project, skipping its archived copy", () => {
    const localArchived = { ...local, archivedAt: archived };
    const old = makeProject({
      id: ProjectId.make("old"),
      workspaceRoot: "/repo/old",
      archivedAt: archived,
    });
    const groups = buildSidebarProjectSnapshots({
      projects: [localArchived, remote, old],
      settings: { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: localEnvironmentId,
      resolveEnvironmentLabel: () => null,
    });
    expect(resolveNewThreadTargetForProjectRef(groups, ref(local), loaded)).toEqual(ref(remote));
    // Settling the last active thread of a project whose only copy is archived picks a project.
    expect(resolveNewThreadTargetForProjectRef(groups, ref(old), loaded)).toBeNull();
  });
});
