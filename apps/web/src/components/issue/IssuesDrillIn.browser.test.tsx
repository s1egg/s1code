import { scopeThreadRef, scopedThreadKey } from "@s1tools/client-runtime/environment";
import type { EnvironmentProject } from "@s1tools/client-runtime/state/shell";
import type { IssueListResult, IssueTrackerKind } from "@s1tools/contracts";
import { EnvironmentId, ProjectId, ThreadId } from "@s1tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

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
import {
  openThreadDetailsDrillIn,
  threadDetailsListCountKey,
  useThreadDetailsStore,
} from "../chat/threadDetailsStore";
import { IssuesDrillIn } from "./IssuesDrillIn";
import { readIssueListPreferences, writeIssueListPreferences } from "./issueListPreferences";

const threadRef = scopeThreadRef(EnvironmentId.make(ENV), ThreadId.make("thread-1"));
const project = { id: "api", environmentId: ENV, title: "api" } as unknown as EnvironmentProject;

function resetList(): Disposable {
  window.localStorage.removeItem("s1.issues.preferences");
  window.localStorage.removeItem("s1.issues.savedViews");
  useThreadDetailsStore.setState({ listCounts: {}, scope: null, explicitListScope: null });
  return {
    [Symbol.dispose]: () =>
      useThreadDetailsStore.setState({ scope: null, explicitListScope: null }),
  };
}

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

  it("saves a view with the projects the thread's own project narrows the list to", async () => {
    using _reset = resetList();
    await using _screen = await render(<IssuesDrillIn threadRef={threadRef} project={project} />);
    await page.getByRole("button", { name: "Saved issue views" }).click();
    await page.getByRole("menuitem", { name: "Save current view…" }).click();
    await userEvent.fill(page.getByLabelText("View name"), "API issues");
    await userEvent.keyboard("{Enter}");
    await expect
      .poll(() => JSON.parse(window.localStorage.getItem("s1.issues.savedViews") ?? "[]"))
      .toEqual([
        expect.objectContaining({
          name: "API issues",
          preferences: expect.objectContaining({ hideProjects: [[ENV, "web"]] }),
        }),
      ]);
  });

  it("opens with the projects an old page address hid instead of the thread's own", async () => {
    using _reset = resetList();
    writeIssueListPreferences({
      who: "all",
      status: "open",
      hideProjects: [[EnvironmentId.make(ENV), ProjectId.make("api")]],
    });
    useThreadDetailsStore.setState({
      scope: scopedThreadKey(threadRef),
      explicitListScope: "issues",
    });
    await using _screen = await render(<IssuesDrillIn threadRef={threadRef} project={project} />);
    expect(state.targets).toEqual([
      expect.objectContaining({ input: expect.objectContaining({ excludeProjectIds: ["api"] }) }),
    ]);
  });

  it("shows the filters an old page address saved while the list was already on screen", async () => {
    using _reset = resetList();
    const attached = { threadRef, presentation: "popover" as const };
    useThreadDetailsStore.getState().attach(attached);
    using _attached = {
      [Symbol.dispose]: () => useThreadDetailsStore.getState().detach(attached),
    };
    await using _screen = await render(<IssuesDrillIn threadRef={threadRef} project={project} />);
    expect(state.targets).toEqual([
      expect.objectContaining({ input: expect.objectContaining({ excludeProjectIds: ["web"] }) }),
    ]);

    // What the redirect from an old Issues address does.
    writeIssueListPreferences({
      who: "all",
      status: "closed",
      hideProjects: [[EnvironmentId.make(ENV), ProjectId.make("api")]],
    });
    openThreadDetailsDrillIn("issues", { explicitListScope: true, reloadList: true });
    await expect
      .poll(() => state.targets)
      .toEqual([
        expect.objectContaining({
          input: expect.objectContaining({ state: "closed", excludeProjectIds: ["api"] }),
        }),
      ]);
  });

  it("cuts a long search to what the list accepts before saving and asking", async () => {
    using _reset = resetList();
    await using _screen = await render(<IssuesDrillIn threadRef={threadRef} project={project} />);
    await userEvent.fill(page.getByRole("searchbox", { name: "Search issues" }), "x".repeat(205));
    expect(readIssueListPreferences().q).toBe("x".repeat(200));
    await expect
      .poll(() => state.targets)
      .toEqual([
        expect.objectContaining({ input: expect.objectContaining({ query: "x".repeat(200) }) }),
      ]);
  });
});
