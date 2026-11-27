import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import { EnvironmentId, SourceControlProviderKind, ThreadId } from "@s1tools/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  type AnyRoute,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { Route as IssuesRoute } from "../../routes/_chat.issues";
import { Route as PullRequestsRoute } from "../../routes/_chat.pull-requests";
import { Route as UsageRoute } from "../../routes/_chat.usage";
import { selectThreadRightPanelState, useRightPanelStore } from "../../rightPanelStore";
import { readIssueListPreferences } from "../issue/issueListPreferences";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { startMainAppLocationTracking } from "../sidebar/mainAppLocation";
import { readProjects } from "../../state/entities";
import { showThreadDetailsDrillIn } from "./openThreadDetails";
import { useThreadDetailsStore } from "./threadDetailsStore";

vi.mock("../../state/entities", { spy: true });

const THREAD_PATH = "/env-1/thread-1";
const threadRef = scopeThreadRef(EnvironmentId.make("env-1"), ThreadId.make("thread-1"));

/** The app's thread route, Workflows, and the old pages' redirect routes. */
function appRouter() {
  const root = createRootRoute();
  const legacy = (path: string, route: AnyRoute) =>
    createRoute({ getParentRoute: () => root, path, beforeLoad: route.options.beforeLoad });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "$environmentId/$threadId" }),
      createRoute({ getParentRoute: () => root, path: "workflows" }),
      createRoute({ getParentRoute: () => root, path: "new" }),
      legacy("usage", UsageRoute),
      legacy("pull-requests", PullRequestsRoute),
      legacy("issues", IssuesRoute),
    ]),
    history: createMemoryHistory({ initialEntries: [THREAD_PATH] }),
  });
  let stopTracking = () => {};
  vi.mocked(readProjects).mockReturnValue([
    {
      id: "project-1",
      environmentId: "env-1",
      repositoryIdentity: {
        canonicalKey: "github.com/s1egg/s1code",
        locator: { source: "git-remote", remoteName: "origin", remoteUrl: "" },
        provider: SourceControlProviderKind.make("github"),
        displayName: "s1egg/s1code",
      },
    } as never,
  ]);
  return {
    router,
    // Tracking starts on the loaded thread, as the app's first resolved page records it; with no
    // React here, later navigations never resolve, so the tracker keeps that thread.
    load: async () => {
      await router.load();
      stopTracking = startMainAppLocationTracking(router);
    },
    [Symbol.dispose]: () => {
      stopTracking();
      vi.mocked(readProjects).mockReset();
      useThreadDetailsStore.setState({
        drillIn: null,
        popoverOpen: false,
        pending: [],
        explicitListScope: null,
      });
      useRightPanelStore.setState({ byThreadKey: {}, userActionRevisionByThreadKey: {} });
    },
  };
}

/** The thread sidebar mounting once the app is back on the thread. */
function mountSidebar() {
  const attached = { threadRef, presentation: "popover" as const };
  useThreadDetailsStore.getState().attach(attached);
  return { [Symbol.dispose]: () => useThreadDetailsStore.getState().detach(attached) };
}

describe("old page addresses", () => {
  it("lead from /usage to the last thread with Usage open", async () => {
    using app = appRouter();
    await app.load();
    await app.router.navigate({ href: "/usage" });
    expect(app.router.state.location.pathname).toBe(THREAD_PATH);

    using _sidebar = mountSidebar();
    expect(useThreadDetailsStore.getState()).toMatchObject({ drillIn: "usage", popoverOpen: true });
  });

  it("keep a pull request list's filters and open its selected pull request beside the thread", async () => {
    using app = appRouter();
    await app.load();
    await app.router.navigate({
      href: "/pull-requests?state=closed&q=%22flaky%22&projectId=project-1&repository=s1egg%2Fs1code&number=41&selectedProjectId=project-1",
    });
    expect(app.router.state.location.pathname).toBe(THREAD_PATH);
    expect(readPullRequestListPreferences()).toMatchObject({
      state: "closed",
      q: "flaky",
      projectId: "project-1",
    });

    using _sidebar = mountSidebar();
    // The address's project filter wins over the thread's own project.
    expect(useThreadDetailsStore.getState()).toMatchObject({
      drillIn: "pull-requests",
      explicitListScope: "pull-requests",
    });
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces,
    ).toEqual([
      expect.objectContaining({
        kind: "pull-request",
        projectId: "project-1",
        repository: "s1egg/s1code",
        number: 41,
      }),
    ]);
  });

  it("find the project holding an old address's pull request from its repository", async () => {
    using app = appRouter();
    await app.load();
    await app.router.navigate({ href: "/pull-requests?repository=s1egg%2Fs1code&number=41" });

    using _sidebar = mountSidebar();
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces,
    ).toEqual([
      expect.objectContaining({
        kind: "pull-request",
        projectId: "project-1",
        repository: "s1egg/s1code",
        number: 41,
      }),
    ]);
  });

  it("keep an issue list's filters and open its selected issue beside the thread", async () => {
    using app = appRouter();
    await app.load();
    await app.router.navigate({
      href: '/issues?status=closed&hideProjects=[["env-1","web"]]&tracker=github&scope=acme%2Fapi&key=%227%22&selectedProjectId=api',
    });
    expect(app.router.state.location.pathname).toBe(THREAD_PATH);
    expect(readIssueListPreferences()).toMatchObject({
      status: "closed",
      hideProjects: [["env-1", "web"]],
    });

    using _sidebar = mountSidebar();
    expect(useThreadDetailsStore.getState()).toMatchObject({
      drillIn: "issues",
      explicitListScope: "issues",
    });
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces,
    ).toEqual([
      expect.objectContaining({ kind: "issue", projectId: "api", scope: "acme/api", key: "7" }),
    ]);
  });
});

it("opens a drill-in from a page outside the thread by going back to the thread first", async () => {
  using app = appRouter();
  await app.load();
  await app.router.navigate({ href: "/workflows" });

  await showThreadDetailsDrillIn(app.router, "pull-requests");
  expect(app.router.state.location.pathname).toBe(THREAD_PATH);
  using _sidebar = mountSidebar();
  expect(useThreadDetailsStore.getState()).toMatchObject({
    drillIn: "pull-requests",
    popoverOpen: true,
  });
});

it("opens a drill-in from the new-thread prompt in the last thread, not on the prompt", async () => {
  using app = appRouter();
  // Rendered, so each page resolves and the tracker records the prompt as the main-app view.
  await using _screen = await render(<RouterProvider router={app.router} />, { router: false });
  const resolved = (pathname: string) =>
    vi.waitFor(() => expect(app.router.state.resolvedLocation?.pathname).toBe(pathname));
  await resolved(THREAD_PATH);
  using _tracking = { [Symbol.dispose]: startMainAppLocationTracking(app.router) };
  await app.router.navigate({ href: "/new" });
  await resolved("/new");

  await showThreadDetailsDrillIn(app.router, "usage");
  await resolved(THREAD_PATH);
});
