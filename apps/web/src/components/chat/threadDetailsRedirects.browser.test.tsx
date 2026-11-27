import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@s1tools/contracts";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type AnyRoute,
} from "@tanstack/react-router";
import { describe, expect, it } from "vite-plus/test";

import { Route as IssuesRoute } from "../../routes/_chat.issues";
import { Route as PullRequestsRoute } from "../../routes/_chat.pull-requests";
import { Route as UsageRoute } from "../../routes/_chat.usage";
import { selectThreadRightPanelState, useRightPanelStore } from "../../rightPanelStore";
import { readIssueListPreferences } from "../issue/issueListPreferences";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { startMainAppLocationTracking } from "../sidebar/mainAppLocation";
import { showThreadDetailsDrillIn } from "./openThreadDetails";
import { useThreadDetailsStore } from "./threadDetailsStore";

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
      legacy("usage", UsageRoute),
      legacy("pull-requests", PullRequestsRoute),
      legacy("issues", IssuesRoute),
    ]),
    history: createMemoryHistory({ initialEntries: [THREAD_PATH] }),
  });
  const stopTracking = startMainAppLocationTracking(router);
  return {
    router,
    [Symbol.dispose]: () => {
      stopTracking();
      useThreadDetailsStore.setState({ drillIn: null, popoverOpen: false, pending: [] });
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
    await app.router.load();
    await app.router.navigate({ href: "/usage" });
    expect(app.router.state.location.pathname).toBe(THREAD_PATH);

    using _sidebar = mountSidebar();
    expect(useThreadDetailsStore.getState()).toMatchObject({ drillIn: "usage", popoverOpen: true });
  });

  it("keep a pull request list's filters and open its selected pull request beside the thread", async () => {
    using app = appRouter();
    await app.router.load();
    await app.router.navigate({
      href: "/pull-requests?state=closed&q=%22flaky%22&repository=s1egg%2Fs1code&number=41&selectedProjectId=project-1",
    });
    expect(app.router.state.location.pathname).toBe(THREAD_PATH);
    expect(readPullRequestListPreferences()).toMatchObject({ state: "closed", q: "flaky" });

    using _sidebar = mountSidebar();
    expect(useThreadDetailsStore.getState().drillIn).toBe("pull-requests");
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
    await app.router.load();
    await app.router.navigate({
      href: "/issues?status=closed&tracker=github&scope=acme%2Fapi&key=%227%22&selectedProjectId=api",
    });
    expect(app.router.state.location.pathname).toBe(THREAD_PATH);
    expect(readIssueListPreferences()).toMatchObject({ status: "closed" });

    using _sidebar = mountSidebar();
    expect(useThreadDetailsStore.getState().drillIn).toBe("issues");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, threadRef).surfaces,
    ).toEqual([
      expect.objectContaining({ kind: "issue", projectId: "api", scope: "acme/api", key: "7" }),
    ]);
  });
});

it("opens a drill-in from a page outside the thread by going back to the thread first", async () => {
  using app = appRouter();
  await app.router.load();
  await app.router.navigate({ href: "/workflows" });

  await showThreadDetailsDrillIn(app.router, "pull-requests");
  expect(app.router.state.location.pathname).toBe(THREAD_PATH);
  using _sidebar = mountSidebar();
  expect(useThreadDetailsStore.getState()).toMatchObject({
    drillIn: "pull-requests",
    popoverOpen: true,
  });
});
