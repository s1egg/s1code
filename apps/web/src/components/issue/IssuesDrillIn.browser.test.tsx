import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import type { EnvironmentProject } from "@s1tools/client-runtime/state/shell";
import type { IssueListResult, IssueTrackerKind } from "@s1tools/contracts";
import { EnvironmentId, ProjectId, ThreadId } from "@s1tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";

const state = vi.hoisted(() => ({ targets: [] as unknown[] }));
const ENV = "env-1";

vi.mock(import("~/state/environments"), async (original) => ({
  ...(await original()),
  useEnvironments: (() => ({
    environments: [
      {
        environmentId: ENV,
        label: "Local",
        serverConfig: { environment: { capabilities: { issues: true } } },
      },
    ],
  })) as never,
  useIssuesSupported: () => true,
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useProjects: (() => [
    { id: "api", environmentId: ENV, title: "api", workspaceRoot: "/api" },
    { id: "web", environmentId: ENV, title: "web", workspaceRoot: "/web" },
  ]) as never,
}));
vi.mock(import("~/state/issues"), async (original) => {
  const answer: IssueListResult = {
    viewers: {},
    trackers: [
      {
        tracker: "github" as IssueTrackerKind,
        host: "github.com",
        projectCount: 1,
        capabilities: null,
        configured: true,
        detail: null,
      },
    ],
    entries: [
      {
        tracker: "github" as IssueTrackerKind,
        host: "github.com",
        scope: "acme/api",
        key: "7",
        displayKey: "#7",
        title: "Crash on save",
        url: "https://github.com/acme/api/issues/7",
        author: null,
        state: { category: "open", name: "open" },
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        closedAt: null,
        assignees: [],
        labels: [],
        commentCount: 0,
        projectId: ProjectId.make("api"),
        projectTitle: "api",
      },
    ],
    errors: [],
    nextCursors: {},
  };
  return {
    ...(await original()),
    useIssueList: ((targets: unknown[]) => {
      state.targets = targets;
      return {
        answers: [[ENV, answer]],
        isPending: false,
        error: null,
        refresh: () => {},
        reload: () => {},
        retry: () => {},
      };
    }) as never,
  };
});

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { threadDetailsListCountKey, useThreadDetailsStore } from "../chat/threadDetailsStore";
import { IssuesDrillIn } from "./IssuesDrillIn";

const threadRef = scopeThreadRef(EnvironmentId.make(ENV), ThreadId.make("thread-1"));
const project = { id: "api", environmentId: ENV, title: "api" } as unknown as EnvironmentProject;

describe("IssuesDrillIn", () => {
  it("reads the thread's project and opens a picked issue in the thread's right panel", async () => {
    useRightPanelStore.setState({ byThreadKey: {}, userActionRevisionByThreadKey: {} });
    useThreadDetailsStore.setState({ listCounts: {} });
    await using _screen = await render(<IssuesDrillIn threadRef={threadRef} project={project} />);

    expect(state.targets).toEqual([
      expect.objectContaining({ input: expect.objectContaining({ excludeProjectIds: ["web"] }) }),
    ]);
    await expect
      .poll(() => useThreadDetailsStore.getState().listCounts)
      .toEqual({ [threadDetailsListCountKey("issues", project)]: 1 });

    await page.getByRole("button", { name: /Crash on save/ }).click();
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef),
    ).toMatchObject({
      isOpen: true,
      surfaces: [{ kind: "issue", projectId: "api", scope: "acme/api", key: "7" }],
    });
  });
});
