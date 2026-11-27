import { scopeThreadRef, scopedThreadKey } from "@s1tools/client-runtime/environment";
import type { EnvironmentProject } from "@s1tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, SourceControlProviderKind, ThreadId } from "@s1tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { render } from "../../../test/render";

const { ENV, state } = vi.hoisted(() => ({ ENV: "env-1", state: { inputs: [] as unknown[] } }));

vi.mock(import("~/state/environments"), async (original) => ({
  ...(await original()),
  useEnvironments: (() => ({
    environments: [
      {
        environmentId: ENV,
        label: "Local",
        connection: { phase: "connected" },
        serverConfig: { environment: { capabilities: {}, platform: { machine: "laptop" } } },
      },
    ],
  })) as never,
}));
vi.mock(import("~/state/entities"), async (original) => ({
  ...(await original()),
  useAllEnvironmentShellsBootstrapped: () => true,
  useProjects: (() => [
    { id: "project-1", environmentId: ENV, title: "s1code", workspaceRoot: "/s1code" },
    { id: "project-2", environmentId: ENV, title: "docs", workspaceRoot: "/docs" },
  ]) as never,
}));
vi.mock(import("~/state/pullRequests"), async (original) => {
  const entry = {
    environmentId: ENV,
    provider: SourceControlProviderKind.make("github"),
    host: "github.com",
    projectId: "project-1",
    projectTitle: "s1code",
    repository: "s1egg/s1code",
    number: 41,
    title: "Move the lists into the thread sidebar",
    url: "https://github.com/s1egg/s1code/pull/41",
    author: { login: "octocat", name: null, avatarUrl: null },
    headBranch: "feat/sidebar",
    baseBranch: "main",
    state: "open",
    isDraft: false,
    mergeability: "mergeable",
    additions: 1,
    deletions: 0,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-02T00:00:00Z",
    viewerReviewRequested: false,
    labels: [],
  };
  // Stable answers, as the real atoms give: the list sets state when an answer's identity changes.
  const answered = {
    data: {
      viewers: {},
      providers: [],
      entries: [entry],
      errors: [],
      truncated: false,
      nextCursors: {},
      truncatedEnvironments: [],
    },
    error: null,
    isPending: false,
    observations: [],
    refresh: () => {},
    retry: () => {},
  };
  const unasked = { ...answered, data: null };
  const list = (targets: ReadonlyArray<{ input: unknown }>) => {
    state.inputs.push(...targets.map((target) => target.input));
    return targets.length === 0 ? unasked : answered;
  };
  const noStats = { stats: null, isPending: false, refresh: () => {} };
  const noRefreshes: never[] = [];
  return {
    ...(await original()),
    usePullRequestHostList: list as never,
    usePullRequestListStats: (() => noStats) as never,
    usePullRequestTurnRefreshes: (() => noRefreshes) as never,
  };
});

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { threadDetailsListCountKey, useThreadDetailsStore } from "../chat/threadDetailsStore";
import { PullRequestsDrillIn } from "./PullRequestsDrillIn";
import { writePullRequestListPreferences } from "./pullRequestListPreferences";

const threadRef = scopeThreadRef(EnvironmentId.make(ENV), ThreadId.make("thread-1"));
const project = { id: "project-1", environmentId: ENV, title: "s1code" } as EnvironmentProject;

it("lists the thread's project and opens a picked pull request in the thread's right panel", async () => {
  window.localStorage.removeItem("s1.pullRequests.preferences");
  useRightPanelStore.setState({ byThreadKey: {}, userActionRevisionByThreadKey: {} });
  useThreadDetailsStore.setState({ listCounts: {} });
  await using _screen = await render(
    <PullRequestsDrillIn threadRef={threadRef} project={project} />,
  );

  const row = page.getByRole("button", { name: /Move the lists into the thread sidebar/ });
  await expect.element(row).toBeVisible();
  expect(state.inputs).toContainEqual(expect.objectContaining({ projectId: "project-1" }));
  await expect
    .poll(() => useThreadDetailsStore.getState().listCounts)
    .toEqual({ [threadDetailsListCountKey("pull-requests", project)]: 1 });

  await row.click();
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef),
  ).toMatchObject({
    isOpen: true,
    surfaces: [{ kind: "pull-request", projectId: "project-1", number: 41 }],
  });
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces[0],
  ).not.toHaveProperty("environmentId");
  await expect.element(row).toHaveAttribute("aria-current", "true");
});

it("lists another project's pull requests once the thread it sits beside changes project", async () => {
  window.localStorage.removeItem("s1.pullRequests.preferences");
  useThreadDetailsStore.setState({ listCounts: {}, explicitListScope: null });
  const docs = { id: "project-2", environmentId: ENV, title: "docs" } as EnvironmentProject;
  await using screen = await render(
    <PullRequestsDrillIn threadRef={threadRef} project={project} />,
  );
  await expect.poll(() => state.inputs.at(-1)).toMatchObject({ projectId: "project-1" });

  await screen.rerender(<PullRequestsDrillIn threadRef={threadRef} project={docs} />);
  await expect.poll(() => state.inputs.at(-1)).toMatchObject({ projectId: "project-2" });
});

it("opens with the project an old page address named instead of the thread's own", async () => {
  writePullRequestListPreferences({
    involvement: "all",
    state: "open",
    projectId: ProjectId.make("project-2"),
    environmentId: EnvironmentId.make(ENV),
  });
  using _store = {
    [Symbol.dispose]: () =>
      useThreadDetailsStore.setState({ scope: null, explicitListScope: null }),
  };
  useThreadDetailsStore.setState({
    listCounts: {},
    scope: scopedThreadKey(threadRef),
    explicitListScope: "pull-requests",
  });
  await using _screen = await render(
    <PullRequestsDrillIn threadRef={threadRef} project={project} />,
  );
  await expect.poll(() => state.inputs.at(-1)).toMatchObject({ projectId: "project-2" });
});
