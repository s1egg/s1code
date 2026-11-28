import { scopedThreadKey, scopeThreadRef } from "@s1tools/client-runtime/environment";
import { EnvironmentId, RunId, ThreadId } from "@s1tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { useClosedViewStore } from "./closedViewStore";
import { linkedThreadTitle } from "./linkedThreadSurface";
import { reopenClosedView } from "./reopenClosedView";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "./terminalUiStateStore";
import {
  floatingPanes,
  hostRightPanel,
  migratePersistedRightPanelState,
  sheetPane,
  paneKindOf,
  pullRequestSurface,
  pullRequestSurfaceId,
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
  visiblePanes,
  type RightPanelSurface,
  type ThreadRightPanelState,
} from "./rightPanelStore";

const refA = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));
const refB = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-B"));

beforeEach(() => {
  useClosedViewStore.setState({ entries: [] });
  useRightPanelStore.setState({
    byThreadKey: {},
    userActionRevisionByThreadKey: {},
    closeRevisionByThreadKey: {},
  });
});

async function reloadRightPanelStore() {
  const { storage, name } = useRightPanelStore.persist.getOptions();
  const persisted = await storage!.getItem(name!);
  expect(persisted).not.toBeNull();
  useRightPanelStore.setState(useRightPanelStore.getInitialState());
  await storage!.setItem(name!, persisted!);
  await useRightPanelStore.persist.rehydrate();
  expect(useRightPanelStore.persist.hasHydrated()).toBe(true);
}

describe("rightPanelStore", () => {
  it("opens a hosted side chat's panel actions in its parent's panel until unhosted", () => {
    const store = useRightPanelStore.getState();
    const unhost = hostRightPanel(refB, refA);
    store.openFile(refB, "src/app.ts");
    expect(selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.id).toBe(
      "file:src/app.ts",
    );
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refB).surfaces,
    ).toEqual([]);
    unhost();
    store.openFile(refB, "src/app.ts");
    expect(selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refB)?.id).toBe(
      "file:src/app.ts",
    );
  });

  it("records closed items, newest first", () => {
    const store = useRightPanelStore.getState();
    const pr = pullRequestSurface({
      projectId: "project-a",
      repository: "s1egg/s1code",
      number: 42,
    });
    store.openFile(refA, "src/app.ts");
    store.open(refA, "device");
    store.openPullRequest(refA, pr);
    store.open(refA, "diff");
    store.closeSurface(refA, pr.id);
    store.closeSurface(refA, "device");
    store.closeSurface(refA, "diff");
    expect(
      useClosedViewStore
        .getState()
        .entries.map((entry) => (entry.kind === "panel-tab" ? entry.surface.id : null)),
    ).toEqual(["diff", "device", pr.id]);
  });

  it.each(["all", "selected"])("reopens the focused item first after closing %s panes", (mode) => {
    const store = useRightPanelStore.getState();
    store.open(refA, "files");
    store.open(refA, "diff");
    store.open(refA, "device");
    store.activateSurface(refA, "diff");
    if (mode === "selected") {
      store.openBrowser(refA, "tab-a");
      store.activateSurface(refA, "diff");
      store.closeSurfaces(refA, ["files", "diff", "device"]);
      expect(
        selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.id,
      ).toBe("browser:tab-a");
    } else {
      store.closeAllSurfaces(refA);
    }

    expect(
      useClosedViewStore
        .getState()
        .entries.map((entry) => entry.kind === "panel-tab" && entry.surface.id),
    ).toEqual(["diff", "device", "files"]);
  });

  it("does not save an incidental Files replacement when opening an existing file", () => {
    const store = useRightPanelStore.getState();
    store.openFile(refA, "src/app.ts");
    store.open(refA, "files");
    store.openFile(refA, "src/app.ts");

    expect(useClosedViewStore.getState().entries).toEqual([]);
  });

  it("ignores session tabs without browser snapshots and records the empty browser tab", () => {
    const store = useRightPanelStore.getState();
    store.openBrowser(refA, "tab-1");
    store.closeSurface(refA, "browser:tab-1");
    expect(useClosedViewStore.getState().entries).toEqual([]);
    store.openBrowser(refA, null);
    store.closeSurface(refA, "browser:new");
    expect(useClosedViewStore.getState().entries).toMatchObject([
      { kind: "panel-tab", surface: { id: "browser:new", resourceId: null } },
    ]);
  });

  it("keeps a dismissed device hidden after another file opens", () => {
    const store = useRightPanelStore.getState();
    const device = {
      hostId: "nucbox",
      deviceId: "emulator-5580",
      name: "Pixel",
      platform: "android",
    } as const;
    store.openFile(refA, "src/app.ts");
    store.closeSurface(refA, "file:src/app.ts");
    store.openDevice(refA, device);
    store.closeSurface(refA, "device:nucbox:emulator-5580");

    store.openFile(refA, "src/app.ts");
    store.openDevice(refA, device, true);

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces,
    ).toEqual([expect.objectContaining({ id: "file:src/app.ts" })]);
  });

  it("records only closed items when panes hide or the terminal pane closes", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.openFile(refA, "src/app.ts");
    store.closeSurface(refA, "file:src/app.ts");
    store.close(refA);
    expect(useClosedViewStore.getState().entries).toMatchObject([
      { kind: "panel-tab", threadRef: refA, surface: { id: "file:src/app.ts" } },
    ]);
    store.toggleVisibility(refA);
    store.toggle(refA, "diff");
    store.open(refA, "terminal");
    store.closeSurface(refA, "terminal");
    expect(useClosedViewStore.getState().entries).toMatchObject([
      { kind: "panel-tab", threadRef: refA, surface: { id: "file:src/app.ts" } },
    ]);
    expect(useClosedViewStore.getState().entries).toHaveLength(1);
  });

  it("gives each host/device its own tab and preserves renamed tabs", () => {
    const store = useRightPanelStore.getState();
    const android = {
      hostId: "nucbox",
      deviceId: "emulator-5580",
      name: "Pixel",
      platform: "android",
    } as const;
    const ios = { hostId: "macmini", deviceId: "ios-1", name: "iPhone", platform: "ios" } as const;
    store.open(refA, "device");
    store.openDevice(refA, android);
    store.open(refA, "device");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces,
    ).toHaveLength(2);
    store.openDevice(refA, ios);
    let state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.surfaces.map((surface) => surface.id)).toEqual([
      "device:nucbox:emulator-5580",
      "device:macmini:ios-1",
    ]);
    store.renameDevice(refA, "device:nucbox:emulator-5580", "Android test");
    store.openDevice(refA, android);
    state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.surfaces).toHaveLength(2);
    expect(state.surfaces[0]).toMatchObject({ title: "Android test", target: android });
    expect(state.activeSurfaceId).toBe("device:nucbox:emulator-5580");
    store.closeSurface(refA, state.activeSurfaceId!);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces,
    ).toEqual([expect.objectContaining({ target: ios })]);
  });

  it("does not collide when two hosts expose the same device id", () => {
    const store = useRightPanelStore.getState();
    const device = { deviceId: "emulator-5554", name: "Pixel", platform: "android" } as const;
    store.openDevice(refA, { ...device, hostId: "a:b" });
    store.openDevice(refA, { ...device, hostId: "a" });
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces,
    ).toHaveLength(2);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refB).surfaces,
    ).toHaveLength(0);
  });

  it.each(["one", "all"])("keeps device tabs dismissed across reload after closing %s", (mode) => {
    const store = useRightPanelStore.getState();
    const target = {
      hostId: "nucbox",
      deviceId: "emulator-5580",
      name: "Pixel",
      platform: "android",
    } as const;
    store.open(refA, "files");
    store.openDevice(refA, target);
    if (mode === "one") store.closeSurface(refA, "device:nucbox:emulator-5580");
    if (mode === "all") store.closeAllSurfaces(refA);
    const persisted = JSON.parse(
      JSON.stringify({ byThreadKey: useRightPanelStore.getState().byThreadKey }),
    );
    useRightPanelStore.setState(migratePersistedRightPanelState(persisted));
    store.openDevice(refA, target, true);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces.some(
        (surface) => surface.kind === "device",
      ),
    ).toBe(false);
    store.openDevice(refA, target);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces.some(
        (surface) => surface.kind === "device",
      ),
    ).toBe(true);
  });

  const completedDiff = { kind: "diff", turnId: RunId.make("turn-1") } as const;
  const linkedPullRequest = pullRequestSurface({
    projectId: "project-a",
    repository: "s1egg/s1code",
    number: 42,
  });

  it.each([
    { order: "diff-first", surface: linkedPullRequest },
    { order: "pull-request-first", surface: linkedPullRequest },
    { order: "diff-first", surface: { id: "pull-requests", kind: "pull-requests" } as const },
    {
      order: "pull-request-first",
      surface: { id: "pull-requests", kind: "pull-requests" } as const,
    },
  ])(
    "prioritizes $surface.kind over browser and diff with $order delivery",
    ({ order, surface }) => {
      const store = useRightPanelStore.getState();
      store.openBrowser(refA, "existing-browser");
      const revision = store.getUserActionRevision(refA);
      const requests = order === "diff-first" ? [completedDiff, surface] : [surface, completedDiff];
      for (const surface of requests) store.openProactive(refA, surface, revision);
      store.reconcileBrowserSurfaces(refA, ["existing-browser", "agent-browser"]);

      expect(
        selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA),
      ).toEqual(surface);

      store.open(refA, "diff");
      expect(
        selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind,
      ).toBe("diff");
    },
  );

  it.each([
    { choice: "file", choose: () => useRightPanelStore.getState().openFile(refA, "src/app.ts") },
    {
      choice: "pull request",
      choose: () =>
        useRightPanelStore.getState().openPullRequest(refA, { ...linkedPullRequest, number: 41 }),
    },
    { choice: "browser", choose: () => useRightPanelStore.getState().openBrowser(refA, "tab-a") },
    {
      choice: "terminal",
      choose: () => useRightPanelStore.getState().open(refA, "terminal"),
    },
    {
      choice: "same tab",
      choose: () => useRightPanelStore.getState().activateSurface(refA, "diff"),
    },
    { choice: "hide", choose: () => useRightPanelStore.getState().close(refA) },
    { choice: "toggle", choose: () => useRightPanelStore.getState().toggle(refA, "diff") },
    { choice: "close all", choose: () => useRightPanelStore.getState().closeAllSurfaces(refA) },
    {
      choice: "terminal close",
      choose: () => {
        const store = useRightPanelStore.getState();
        store.open(refA, "terminal");
        store.closeSurface(refA, "terminal");
      },
    },
  ])("keeps a later $choice choice when automatic requests arrive", ({ choose }) => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    const revision = store.getUserActionRevision(refA);
    choose();
    const chosen = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);

    expect(store.openProactive(refA, completedDiff, revision)).toBe(false);
    expect(store.openProactive(refA, linkedPullRequest, revision)).toBe(false);
    expect(
      store.openProactive(refA, { id: "pull-requests", kind: "pull-requests" }, revision),
    ).toBe(false);
    const { isOpen, activeSurfaceId, surfaces } = selectThreadRightPanelState(
      useRightPanelStore.getState().byThreadKey,
      refA,
    );
    expect({ isOpen, activeSurfaceId, surfaces }).toEqual({
      isOpen: chosen.isOpen,
      activeSurfaceId: chosen.activeSurfaceId,
      surfaces: chosen.surfaces,
    });
  });

  it.each([
    {
      surface: linkedPullRequest,
      choose: () => useRightPanelStore.getState().openFile(refA, "notes.md"),
    },
    {
      surface: { id: "pull-requests", kind: "pull-requests" } as const,
      choose: () => useRightPanelStore.getState().openBrowser(refA, "tab-a"),
    },
  ])(
    "preserves the selected tab and hidden panel when $surface.kind already exists",
    ({ surface, choose }) => {
      const store = useRightPanelStore.getState();
      store.openProactive(refA, surface, store.getUserActionRevision(refA));
      choose();
      const chosen = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);

      // Re-entry captures a fresh revision; the existing tab must still preserve the choice.
      expect(store.openProactive(refA, surface, store.getUserActionRevision(refA))).toBe(false);
      expect(selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA)).toEqual(
        chosen,
      );

      store.close(refA);
      expect(store.openProactive(refA, surface, store.getUserActionRevision(refA))).toBe(false);
      expect(
        selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
      ).toMatchObject({
        ...chosen,
        isOpen: false,
      });
    },
  );

  it("retargets an existing PR tab but respects a later manual choice", () => {
    const store = useRightPanelStore.getState();
    const relinkedPullRequest = pullRequestSurface({ ...linkedPullRequest, number: 43 });
    store.openPullRequest(refA, relinkedPullRequest);
    store.openPullRequest(refA, linkedPullRequest);
    const revision = store.getUserActionRevision(refA);

    expect(store.openProactive(refA, relinkedPullRequest, revision, true)).toBe(true);
    expect(selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)).toEqual(
      relinkedPullRequest,
    );

    store.close(refA);
    expect(store.openProactive(refA, linkedPullRequest, revision, true)).toBe(false);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({
      activeSurfaceId: relinkedPullRequest.id,
      isOpen: false,
    });
  });

  it("refocuses an existing diff for a later turn after a manual choice", () => {
    const store = useRightPanelStore.getState();
    store.openProactive(refA, completedDiff, store.getUserActionRevision(refA));
    const firstTurnRevision = store.getUserActionRevision(refA);
    store.openFile(refA, "src/app.ts");
    expect(store.openProactive(refA, completedDiff, firstTurnRevision)).toBe(false);

    const nextTurnRevision = store.getUserActionRevision(refA);
    expect(
      store.openProactive(
        refA,
        { ...completedDiff, turnId: RunId.make("turn-2") },
        nextTurnRevision,
      ),
    ).toBe(true);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind,
    ).toBe("diff");
  });

  it("offers each completed diff once across dismissal, panel changes, and reload", async () => {
    const store = useRightPanelStore.getState();
    expect(store.openProactive(refA, completedDiff, store.getUserActionRevision(refA))).toBe(true);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind,
    ).toBe("diff");

    store.close(refA);
    await reloadRightPanelStore();
    expect(store.openProactive(refA, completedDiff, store.getUserActionRevision(refA))).toBe(false);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind ?? null,
    ).toBeNull();

    store.open(refA, "files");
    store.openFile(refA, "src/app.ts");
    await reloadRightPanelStore();
    expect(store.openProactive(refA, completedDiff, store.getUserActionRevision(refA))).toBe(false);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind,
    ).toBe("file");

    store.closeAllSurfaces(refA);
    await reloadRightPanelStore();
    expect(store.openProactive(refA, completedDiff, store.getUserActionRevision(refA))).toBe(false);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind ?? null,
    ).toBeNull();

    const otherEnvironment = scopeThreadRef("env-2" as EnvironmentId, refA.threadId);
    for (const ref of [refB, otherEnvironment]) {
      expect(store.openProactive(ref, completedDiff, store.getUserActionRevision(ref))).toBe(true);
      expect(
        selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, ref)?.kind,
      ).toBe("diff");
    }

    const nextTurn = { ...completedDiff, turnId: RunId.make("turn-2") };
    expect(store.openProactive(refA, nextTurn, store.getUserActionRevision(refA))).toBe(true);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind,
    ).toBe("diff");

    const completedWhileOpen = { ...completedDiff, turnId: RunId.make("turn-3") };
    const existingDiff = selectActiveRightPanelSurface(
      useRightPanelStore.getState().byThreadKey,
      refA,
    );
    expect(store.openProactive(refA, completedWhileOpen, store.getUserActionRevision(refA))).toBe(
      false,
    );
    expect(selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)).toEqual(
      existingDiff,
    );
    store.closeSurface(refA, "diff");
    await reloadRightPanelStore();
    expect(store.openProactive(refA, completedWhileOpen, store.getUserActionRevision(refA))).toBe(
      false,
    );
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind ?? null,
    ).toBeNull();

    // A later storage migration must preserve the dismissal, just like an ordinary reload.
    const { storage, name, version } = useRightPanelStore.persist.getOptions();
    const persisted = await storage!.getItem(name!);
    await storage!.setItem(name!, { ...persisted!, version: version! - 1 });
    await reloadRightPanelStore();
    expect(store.openProactive(refA, completedWhileOpen, store.getUserActionRevision(refA))).toBe(
      false,
    );
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind ?? null,
    ).toBeNull();

    expect(
      store.openProactive(
        refA,
        { ...completedDiff, turnId: RunId.make("turn-4") },
        store.getUserActionRevision(refA),
      ),
    ).toBe(true);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind,
    ).toBe("diff");
    store.closeSurface(refA, "diff");
    store.open(refA, "diff");
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind,
    ).toBe("diff");
  });

  it("keeps manual choices scoped to their thread and environment", () => {
    const otherEnvironment = scopeThreadRef("env-2" as EnvironmentId, refA.threadId);
    const store = useRightPanelStore.getState();
    const revision = store.getUserActionRevision(refA);
    store.openFile(refB, "src/app.ts");
    store.openFile(otherEnvironment, "src/app.ts");

    expect(store.openProactive(refA, completedDiff, revision)).toBe(true);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refB)?.kind,
    ).toBe("file");
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, otherEnvironment)
        ?.kind ?? null,
    ).toBe("file");
  });

  it("does not treat resource reconciliation as a manual choice", () => {
    const store = useRightPanelStore.getState();
    store.openFile(refA, "src/app.ts");
    const revision = store.getUserActionRevision(refA);
    store.reconcileBrowserSurfaces(refA, ["agent-browser"]);
    store.reconcileFileSurfaces(refA, false);

    expect(store.openProactive(refA, completedDiff, revision)).toBe(true);
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.kind,
    ).toBe("diff");
  });

  it("keeps a filled pane per thread without counting it as a manual choice", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "preview");
    store.open(refB, "diff");
    const revision = store.getUserActionRevision(refA);
    store.setFill(refA, "browser");
    store.setFill(refB, "diff");
    store.setFill(refB, null);

    const { byThreadKey } = useRightPanelStore.getState();
    expect(selectThreadRightPanelState(byThreadKey, refA).fill).toBe("browser");
    expect(selectThreadRightPanelState(byThreadKey, refB).fill).toBeUndefined();
    expect(store.getUserActionRevision(refA)).toBe(revision);
  });

  it("fills the window with a tab that was saved maximized", () => {
    const migrated = migratePersistedRightPanelState({
      byThreadKey: {
        "env-1:thread-A": {
          isOpen: true,
          activeSurfaceId: "browser:new",
          surfaces: [{ id: "browser:new", kind: "preview", resourceId: null }],
          maximized: true,
        },
      },
    });
    expect(selectThreadRightPanelState(migrated.byThreadKey, refA).fill).toBe("browser");
  });

  it("opens a linked thread once per thread and environment it is read through", () => {
    const store = useRightPanelStore.getState();
    const target = {
      viaEnvironmentId: EnvironmentId.make("env-1"),
      environmentId: EnvironmentId.make("env:b"),
      threadId: ThreadId.make("there"),
      label: "fs-17",
      title: null,
    };
    store.openLinkedThread(refA, target);
    store.open(refA, "diff");
    store.openLinkedThread(refA, { ...target, label: "renamed", title: "Fix the build" });
    store.openLinkedThread(refA, { ...target, title: null });
    store.openLinkedThread(refA, { ...target, viaEnvironmentId: EnvironmentId.make("env-2") });
    const panel = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(panel.surfaces.map((surface) => surface.id)).toEqual([
      "linked-thread:env-1:env%3Ab:there",
      "diff",
      "linked-thread:env-2:env%3Ab:there",
    ]);
    // A click that knows no title keeps the one an earlier click or read gave.
    expect(panel.surfaces[0]).toMatchObject({ label: "fs-17", title: "Fix the build" });
    store.setLinkedThreadTitle(refA, "linked-thread:env-1:env%3Ab:there", "Fix flaky test");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces[0],
    ).toMatchObject({ title: "Fix flaky test" });
    // The tab is named for the thread once its title is known, else for where it is.
    expect(linkedThreadTitle({ title: "Fix flaky test" }, "Thread on fs-17")).toBe(
      "Fix flaky test",
    );
    expect(linkedThreadTitle({ title: " " }, "Thread on fs-17")).toBe("Thread on fs-17");
    expect(linkedThreadTitle({ title: null }, "Thread on fs-17")).toBe("Thread on fs-17");
  });

  /** The one pane a migrated tab row becomes: the tab that was showing, beside the chat. */
  const migratedPane = (
    surface: RightPanelSurface,
    options: { isOpen?: boolean; fill?: boolean } = {},
  ): ThreadRightPanelState => {
    const pane = paneKindOf(surface.kind);
    return {
      isOpen: options.isOpen ?? true,
      layout: {
        type: "split",
        direction: "row",
        children: [{ type: "chat" }, { type: "pane", pane }],
        sizes: [0.6, 0.4],
      },
      surfaces: [surface],
      activeSurfaceId: surface.id,
      paneSurfaceIds: { [pane]: surface.id },
      ...(options.fill ? { fill: pane } : {}),
    };
  };

  it("keeps a saved linked thread it can show and drops the other tabs", () => {
    const linked = {
      id: "linked-thread:stale-id",
      kind: "linked-thread",
      viaEnvironmentId: "env-1",
      environmentId: "env-b",
      threadId: "there",
      label: "fs-17",
    };
    const migrated = migratePersistedRightPanelState({
      byThreadKey: {
        "env-1:thread-A": {
          isOpen: true,
          activeSurfaceId: "linked-thread:stale-id",
          surfaces: [
            linked,
            { ...linked, id: "linked-thread:no-thread", threadId: undefined },
            { id: "hologram:1", kind: "hologram" },
            null,
            { id: "diff", kind: "diff" },
          ],
        },
      },
    });
    expect(selectThreadRightPanelState(migrated.byThreadKey, refA)).toEqual(
      migratedPane({
        id: "linked-thread:env-1:env-b:there",
        kind: "linked-thread",
        viaEnvironmentId: EnvironmentId.make("env-1"),
        environmentId: EnvironmentId.make("env-b"),
        threadId: ThreadId.make("there"),
        label: "fs-17",
        title: null,
      }),
    );
  });

  it("opens a side chat or subagent once per thread, and never the panel's own thread", () => {
    const store = useRightPanelStore.getState();
    const child = ThreadId.make("child");
    store.openThread(refA, child);
    store.open(refA, "diff");
    store.openThread(refA, child);
    store.openThread(refA, refA.threadId);
    const panel = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(panel.surfaces.map((surface) => surface.id)).toEqual(["thread:child", "diff"]);
    expect(panel.activeSurfaceId).toBe("thread:child");
  });

  it("keeps the side chat tab that was showing, saved before it became a thread surface", () => {
    const migrated = migratePersistedRightPanelState({
      byThreadKey: {
        "env-1:thread-A": {
          isOpen: true,
          activeSurfaceId: "side-chat:side",
          surfaces: [
            { id: "diff", kind: "diff" },
            { id: "side-chat:side", kind: "side-chat", threadId: "side" },
            { id: "side-chat:gone", kind: "side-chat" },
          ],
        },
      },
    });
    expect(selectThreadRightPanelState(migrated.byThreadKey, refA)).toEqual(
      migratedPane({ id: "thread:side", kind: "thread", threadId: ThreadId.make("side") }),
    );
  });

  it.each([
    ["the legacy singleton", { id: "terminal", kind: "terminal" }, "terminal"],
    [
      "a single-session",
      { id: "terminal:term-1", kind: "terminal", resourceId: "term-1" },
      "terminal:term-1",
    ],
    [
      "a split",
      {
        id: "terminal:term-1",
        kind: "terminal",
        resourceId: "term-1",
        terminalIds: ["term-1", "term-2"],
        activeTerminalId: "term-2",
      },
      "terminal:term-1",
    ],
  ])("turns %s terminal tab into the terminal pane", (_name, surface, activeSurfaceId) => {
    expect(
      migratePersistedRightPanelState({
        byThreadKey: {
          "env-1:thread-A": {
            isOpen: true,
            activeSurfaceId,
            surfaces: [{ id: "browser:tab-a", kind: "preview", resourceId: "tab-a" }, surface],
          },
        },
      }),
    ).toEqual({
      terminalGroups: expect.any(Object),
      byThreadKey: { "env-1:thread-A": migratedPane({ id: "terminal", kind: "terminal" }) },
    });
  });

  it("upgrades the legacy singleton pull request surface to a reference-keyed pane", () => {
    const id = pullRequestSurfaceId({
      projectId: "project-a",
      repository: "s1egg/s1code",
      number: 4909,
    });
    expect(
      migratePersistedRightPanelState({
        byThreadKey: {
          "env-1:thread-A": {
            isOpen: true,
            activeSurfaceId: "pull-request",
            surfaces: [
              {
                id: "pull-request",
                kind: "pull-request",
                projectId: "project-a",
                repository: "s1egg/s1code",
                number: 4909,
              },
            ],
          },
        },
      }),
    ).toEqual({
      terminalGroups: expect.any(Object),
      byThreadKey: {
        "env-1:thread-A": migratedPane({
          id,
          kind: "pull-request",
          projectId: "project-a",
          repository: "s1egg/s1code",
          number: 4909,
        }),
      },
    });
  });

  it("drops the pull-request list's shared panel so a restart opens the page fresh", () => {
    const id = pullRequestSurfaceId({
      projectId: "project-a",
      repository: "s1egg/s1code",
      number: 4909,
    });
    const surface = {
      id,
      kind: "pull-request" as const,
      projectId: "project-a",
      repository: "s1egg/s1code",
      number: 4909,
    };
    const panelState = { isOpen: true, activeSurfaceId: id, surfaces: [surface] };
    expect(
      migratePersistedRightPanelState({
        byThreadKey: {
          "env-1:pull-requests-panel": panelState,
          "env-1:thread-A": panelState,
        },
      }),
    ).toEqual({
      terminalGroups: expect.any(Object),
      byThreadKey: { "env-1:thread-A": migratedPane(surface) },
    });
  });

  it("keeps a hidden panel's tab as a pane the layout is ready to show", () => {
    expect(
      migratePersistedRightPanelState({
        byThreadKey: {
          "env-1:thread-A": {
            isOpen: false,
            activeSurfaceId: "diff",
            surfaces: [{ id: "diff", kind: "diff" }],
          },
        },
      }),
    ).toEqual({
      terminalGroups: expect.any(Object),
      byThreadKey: {
        "env-1:thread-A": migratedPane({ id: "diff", kind: "diff" }, { isOpen: false }),
      },
    });
  });

  it.each([
    { kind: "plan", isOpen: true },
    { kind: "agents", isOpen: true },
    { kind: "agents", isOpen: false },
  ])("drops $kind with isOpen=$isOpen and falls back", ({ kind, isOpen }) => {
    expect(
      migratePersistedRightPanelState({
        byThreadKey: {
          "env-1:thread-A": {
            isOpen,
            activeSurfaceId: kind,
            surfaces: [{ id: kind, kind }],
          },
          "env-1:thread-B": {
            isOpen,
            activeSurfaceId: kind,
            surfaces: [
              { id: kind, kind },
              { id: "diff", kind: "diff" },
            ],
          },
        },
      }),
    ).toEqual({
      terminalGroups: expect.any(Object),
      byThreadKey: {
        "env-1:thread-B": migratedPane({ id: "diff", kind: "diff" }, { isOpen }),
      },
    });
  });

  it("drops the retired per-thread details card visibility", () => {
    expect(
      migratePersistedRightPanelState({
        threadPanelVisibilityByThreadKey: {
          "env-1:thread-A": { inlineOpen: false, popoverOpen: true },
        },
      }),
    ).toEqual({ byThreadKey: {}, terminalGroups: {} });
  });

  it("opens workspace-root links as the singleton files explorer", () => {
    const store = useRightPanelStore.getState();
    store.openFile(refA, "README.md");
    store.openFile(refA, ".");
    store.openFile(refA, ".");
    const state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.activeSurfaceId).toBe("files");
    expect(state.surfaces.map((surface) => surface.id)).toEqual(["file:README.md", "files"]);
    store.closeSurface(refA, "files");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).activeSurfaceId,
    ).toBe("file:README.md");
    store.openFile(refA, ".");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).activeSurfaceId,
    ).toBe("files");
  });

  it("walks a folder browser up and back down in one tab", () => {
    const store = useRightPanelStore.getState();
    const state = () =>
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    store.openFile(refA, "README.md");
    store.openFile(refA, "apps/web/src");

    store.navigateFolder(refA, "file:apps/web/src", "apps", "apps/web/src");
    expect(state().activeSurfaceId).toBe("file:apps");
    expect(state().surfaces).toEqual([
      expect.objectContaining({ id: "file:README.md" }),
      expect.objectContaining({
        id: "file:apps",
        relativePath: "apps",
        folderTrail: "apps/web/src",
      }),
    ]);

    store.navigateFolder(refA, "file:apps", "", "apps/web/src");
    expect(state().surfaces.map((surface) => surface.id)).toEqual(["file:README.md", "files"]);
    expect(state().surfaces[1]).toEqual({
      id: "files",
      kind: "files",
      folderTrail: "apps/web/src",
    });

    store.navigateFolder(refA, "files", "apps/web/src", "apps/web/src");
    expect(state().activeSurfaceId).toBe("file:apps/web/src");
    expect(state().surfaces[1]).toEqual({
      id: "file:apps/web/src",
      kind: "file",
      relativePath: "apps/web/src",
      revealLine: null,
      revealRequestId: 1,
    });
  });

  it("switches to a tab that already shows the folder instead of replacing it", () => {
    const store = useRightPanelStore.getState();
    store.openFile(refA, "apps");
    store.openFile(refA, "apps/web/src", 12);

    store.navigateFolder(refA, "file:apps/web/src", "apps", "apps/web/src");
    const state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.activeSurfaceId).toBe("file:apps");
    expect(state.surfaces).toEqual([
      {
        id: "file:apps",
        kind: "file",
        relativePath: "apps",
        revealLine: null,
        revealRequestId: expect.any(Number),
      },
    ]);
  });

  it("keeps a file's tab when walking up from it, and comes back to it", () => {
    const store = useRightPanelStore.getState();
    const state = () =>
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    store.openFile(refA, "src/app.ts", 40);
    const file = state().surfaces[0];

    store.navigateFolder(refA, "file:src/app.ts", "src", "src/app.ts", true);
    expect(state().activeSurfaceId).toBe("file:src");
    expect(state().surfaces).toEqual([
      file,
      expect.objectContaining({ id: "file:src", folderTrail: "src/app.ts" }),
    ]);

    store.navigateFolder(refA, "file:src", "src/app.ts", "src/app.ts");
    expect(state().activeSurfaceId).toBe("file:src/app.ts");
    expect(state().surfaces).toEqual([file]);
  });

  // regression: #15045 breadcrumb navigation from a closed tab must not resurrect it
  it("ignores navigation from a tab that was closed", () => {
    const store = useRightPanelStore.getState();
    store.openFile(refA, "apps");
    const before = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    store.navigateFolder(refA, "file:gone", "", "gone");
    expect(selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA)).toBe(
      before,
    );
  });

  it("replaces the standalone explorer with peer file surfaces", () => {
    useRightPanelStore.getState().open(refA, "files");
    useRightPanelStore.getState().openFile(refA, "src/index.ts");
    useRightPanelStore.getState().openFile(refA, "src/index.ts");
    useRightPanelStore.getState().openFile(refA, "README.md");

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "file:README.md",
      surfaces: [
        {
          id: "file:src/index.ts",
          kind: "file",
          relativePath: "src/index.ts",
          revealLine: null,
          revealRequestId: expect.any(Number),
        },
        {
          id: "file:README.md",
          kind: "file",
          relativePath: "README.md",
          revealLine: null,
          revealRequestId: expect.any(Number),
        },
      ],
    });
  });

  it.each([
    ["generated\\", "generated"],
    ["notes/meeting ", "notes/meeting"],
    [" notes/meeting", "notes/meeting"],
  ])("keeps %j and %j in separate file tabs", (firstPath, secondPath) => {
    useRightPanelStore.getState().openFile(refA, firstPath);
    useRightPanelStore.getState().openFile(refA, secondPath);

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces,
    ).toMatchObject([
      { id: `file:${firstPath}`, relativePath: firstPath },
      { id: `file:${secondPath}`, relativePath: secondPath },
    ]);
  });

  it("keeps attachment and workspace file ids disjoint", () => {
    useRightPanelStore.getState().openFile(refA, "attachment:shared-id");
    useRightPanelStore.getState().openAttachment(refA, {
      type: "file",
      id: "shared-id",
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
    });

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).surfaces.map(
        (surface) => surface.id,
      ),
    ).toEqual(["file:attachment:shared-id", "attachment:shared-id"]);
  });

  it.each(["none", "next"])(
    "assigns a fresh line request after closing a file tab (persisted ID: %s)",
    async (persisted) => {
      const store = useRightPanelStore.getState();
      const requestId = () => {
        const surface = selectActiveRightPanelSurface(
          useRightPanelStore.getState().byThreadKey,
          refA,
        );
        if (surface?.kind !== "file") return expect.unreachable();
        return surface.revealRequestId;
      };
      if (persisted !== "none") {
        store.openFile(refA, "seed.log", 42);
        const persistedId = requestId() + 1;
        useRightPanelStore.setState({
          byThreadKey: {
            [scopedThreadKey(refA)]: {
              ...selectThreadRightPanelState(store.byThreadKey, refA),
              isOpen: true,
              activeSurfaceId: "file:app.log",
              surfaces: [
                {
                  id: "file:app.log",
                  kind: "file",
                  relativePath: "app.log",
                  revealLine: 42,
                  revealRequestId: persistedId,
                },
              ],
            },
          },
        });
        await reloadRightPanelStore();
      } else {
        store.openFile(refA, "app.log", 42);
      }
      const first = requestId();
      store.closeSurface(refA, "file:app.log");

      store.openFile(refA, "app.log", 42);
      const reopened = requestId();
      expect(reopened).not.toBe(first);
    },
  );

  it("updates line reveal requests when reopening a file surface", () => {
    useRightPanelStore.getState().openFile(refA, "src/index.ts", 42);
    const requestId = () => {
      const surface = selectActiveRightPanelSurface(
        useRightPanelStore.getState().byThreadKey,
        refA,
      );
      if (surface?.kind !== "file") return expect.unreachable();
      return surface.revealRequestId;
    };
    const first = requestId();
    useRightPanelStore.getState().openFile(refA, "src/index.ts", 87);
    expect(requestId()).toBeGreaterThan(first);

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "file:src/index.ts",
      surfaces: [
        {
          id: "file:src/index.ts",
          kind: "file",
          relativePath: "src/index.ts",
          revealLine: 87,
          revealRequestId: expect.any(Number),
        },
      ],
    });

    useRightPanelStore.getState().openFile(refA, "src/index.ts");

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "file:src/index.ts",
      surfaces: [
        {
          id: "file:src/index.ts",
          kind: "file",
          relativePath: "src/index.ts",
          revealLine: null,
          revealRequestId: expect.any(Number),
        },
      ],
    });
  });

  it("removes persisted file surfaces when their workspace no longer exists", () => {
    useRightPanelStore.getState().openFile(refA, "src/index.ts");
    useRightPanelStore.getState().open(refA, "device");
    useRightPanelStore.getState().openFile(refA, "README.md");

    useRightPanelStore.getState().reconcileFileSurfaces(refA, false);

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "device",
      surfaces: [{ id: "device", kind: "device" }],
    });

    useRightPanelStore.getState().openFile(refB, "conductor.json");
    useRightPanelStore.getState().reconcileFileSurfaces(refB, false);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refB),
    ).toMatchObject({
      isOpen: false,
      layout: null,
      activeSurfaceId: null,
      surfaces: [],
    });
  });

  it("keeps attachment previews when their workspace is unavailable", () => {
    const attachment = {
      type: "file" as const,
      id: "thread-A-attachment-pdf",
      name: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 42,
    };
    useRightPanelStore.getState().openFile(refA, "README.md");
    useRightPanelStore.getState().openAttachment(refA, attachment);

    useRightPanelStore.getState().reconcileFileSurfaces(refA, false);

    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({
      isOpen: true,
      activeSurfaceId: "attachment:thread-A-attachment-pdf",
      surfaces: [
        {
          id: "attachment:thread-A-attachment-pdf",
          kind: "file",
          relativePath: "report.pdf",
          revealLine: null,
          revealRequestId: 0,
          attachment,
        },
      ],
    });
  });

  it("tracks one surface per pull request", () => {
    const first = { projectId: "project-a", repository: "s1egg/s1code", number: 4909 };
    const second = { projectId: "project-a", repository: "s1egg/s1code", number: 4910 };
    useRightPanelStore.getState().openPullRequest(refA, first);
    useRightPanelStore.getState().openPullRequest(refA, second);
    const url = "https://gitlab.example.com/s1egg/s1code/-/merge_requests/4909";
    useRightPanelStore.getState().openPullRequest(refA, { ...first, url });
    useRightPanelStore.getState().openPullRequest(refA, first);

    const state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.surfaces.map((surface) => surface.id)).toEqual([
      pullRequestSurfaceId(first),
      pullRequestSurfaceId(second),
    ]);
    expect(state.activeSurfaceId).toBe(pullRequestSurfaceId(first));
    expect(
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({ url });
    expect(state.surfaces[1]).not.toHaveProperty("url");
    expect(state.surfaces[0]).not.toHaveProperty("revealUrl");
  });

  it("holds a clicked link until the panel settles it, and a later link replaces it", async () => {
    const pr = { projectId: "project-a", repository: "s1egg/s1code", number: 4909 };
    const id = pullRequestSurfaceId(pr);
    const url = "https://github.com/s1egg/s1code/pull/4909";
    const surface = () =>
      selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA);
    const comment = (n: number) => `${url}#issuecomment-${n}`;
    const store = useRightPanelStore.getState();
    store.openPullRequest(refA, { ...pr, url: comment(1), revealUrl: comment(1) });
    expect(surface()).toMatchObject({ url: comment(1), revealUrl: comment(1) });
    store.openPullRequest(refA, { ...pr, url });
    expect(surface()).not.toHaveProperty("revealUrl");
    store.openPullRequest(refA, { ...pr, url: comment(2), revealUrl: comment(2) });
    // A host read started for an earlier link settles only that link.
    store.settlePullRequestReveal(refA, id, comment(1));
    expect(surface()).toMatchObject({ revealUrl: comment(2) });
    store.settlePullRequestReveal(refA, id, comment(2));
    expect(surface()).toMatchObject({ url: comment(2) });
    expect(surface()).not.toHaveProperty("revealUrl");
    // Reopening a closed tab hands back its surface, whose url still names the comment.
    store.openPullRequest(refA, { ...pr, url: comment(2) });
    expect(surface()).not.toHaveProperty("revealUrl");
    store.openPullRequest(refA, { ...pr, url: comment(3), revealUrl: comment(3) });
    await reloadRightPanelStore();
    expect(surface()).toMatchObject({ url: comment(3) });
    expect(surface()).not.toHaveProperty("revealUrl");
    store.openPullRequest(refA, { ...pr, url: comment(4), revealUrl: comment(4) });
    store.closeSurface(refA, id);
    await reopenClosedView(useClosedViewStore.getState().entries[0]!, {
      workspaceAvailable: true,
      openPreview: () => {
        throw new Error("A PR tab must not create a browser session");
      },
    });
    expect(surface()).toMatchObject({ url: comment(4) });
    expect(surface()).not.toHaveProperty("revealUrl");
  });

  it("restores each environment, thread and PR surface's detail tab after reload and URL reopen", async () => {
    const pr = { projectId: "project-a", repository: "s1egg/s1code", number: 4909 };
    const otherPr = { ...pr, projectId: "project-b" };
    const otherEnvironment = scopeThreadRef("env-2" as EnvironmentId, refA.threadId);
    const selections = [
      [refA, pr, "code"],
      [refB, pr, "guide"],
      [otherEnvironment, pr, "timeline"],
      [refA, otherPr, "summary"],
    ] as const;
    const store = useRightPanelStore.getState();
    for (const [ref, reference, tab] of selections) {
      store.openPullRequest(ref, reference);
      store.setPullRequestDetailTab(ref, pullRequestSurfaceId(reference), "guide");
      store.setPullRequestDetailTab(ref, pullRequestSurfaceId(reference), tab);
    }

    store.openPullRequest(refA, pr);
    const revision = store.getUserActionRevision(refA);
    store.setPullRequestDetailTab(refA, pullRequestSurfaceId(pr), "timeline");
    expect(store.openProactive(refA, linkedPullRequest, revision)).toBe(true);
    expect(selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)).toEqual(
      linkedPullRequest,
    );
    store.setPullRequestDetailTab(refA, pullRequestSurfaceId(pr), "code");

    const { storage, name } = useRightPanelStore.persist.getOptions();
    const saved = await storage!.getItem(name!);
    expect(saved).not.toBeNull();
    useRightPanelStore.setState({ byThreadKey: {} });
    await storage!.setItem(name!, saved!);
    await useRightPanelStore.persist.rehydrate();

    for (const [ref, reference, tab] of selections) {
      store.openPullRequest(ref, {
        ...reference,
        url: `https://github.com/${reference.repository}/pull/${reference.number}`,
      });
      const active = selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, ref);
      expect(active?.id).toBe(pullRequestSurfaceId(reference));
      expect(active?.kind === "pull-request" && (active.detailTab ?? "summary")).toBe(tab);
      store.closeSurface(ref, active!.id);
      await reopenClosedView(useClosedViewStore.getState().entries[0]!, {
        workspaceAvailable: true,
        openPreview: () => {
          throw new Error("A PR tab must not create a browser session");
        },
      });
      const reopened = selectActiveRightPanelSurface(
        useRightPanelStore.getState().byThreadKey,
        ref,
      );
      expect(reopened?.kind === "pull-request" && (reopened.detailTab ?? "summary")).toBe(tab);
    }
  });

  it("keeps matching repository and number on different hosts as separate tabs", () => {
    const first = { projectId: "project-a", repository: "acme/api", number: 7, host: "github.com" };
    const second = { ...first, host: "github.example.com" };
    useRightPanelStore.getState().openPullRequest(refA, first);
    useRightPanelStore.getState().openPullRequest(refA, second);
    const state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.surfaces).toEqual([pullRequestSurface(first), pullRequestSurface(second)]);
    expect(pullRequestSurfaceId({ ...first, host: "GITHUB.COM" })).toBe(
      pullRequestSurfaceId(first),
    );
  });

  const layoutOf = (ref = refA) =>
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref).layout;

  it("places the first pane beside the chat and later ones under the focused pane", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    expect(layoutOf()).toEqual({
      type: "split",
      direction: "row",
      children: [{ type: "chat" }, { type: "pane", pane: "diff" }],
      sizes: [0.6, 0.4],
    });
    store.open(refA, "terminal");
    store.open(refA, "files");
    expect(layoutOf()).toMatchObject({
      direction: "row",
      children: [
        { type: "chat" },
        {
          direction: "column",
          children: [
            { type: "pane", pane: "diff" },
            { type: "pane", pane: "terminal" },
            { type: "pane", pane: "files" },
          ],
        },
      ],
    });
  });

  it("shows one item per pane and switches items inside it", () => {
    const store = useRightPanelStore.getState();
    store.openFile(refA, "src/a.ts");
    store.openFile(refA, "src/b.ts");
    store.openBrowser(refA, "tab-a");
    const state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.paneSurfaceIds).toEqual({ files: "file:src/b.ts", browser: "browser:tab-a" });
    store.activateSurface(refA, "file:src/a.ts");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).paneSurfaceIds
        .files,
    ).toBe("file:src/a.ts");
    // Closing the shown item shows the pane's next one; closing the last removes the pane.
    store.closeSurface(refA, "file:src/a.ts");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).paneSurfaceIds
        .files,
    ).toBe("file:src/b.ts");
    store.closeSurface(refA, "file:src/b.ts");
    expect(layoutOf()).toMatchObject({
      children: [{ type: "chat" }, { type: "pane", pane: "browser" }],
    });
  });

  it("splits a tile on the side a pane is dropped on, and never stacks panes as tabs", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.open(refA, "terminal");
    store.movePane(refA, "terminal", "chat", "bottom");
    expect(layoutOf()).toEqual({
      type: "split",
      direction: "row",
      children: [
        {
          type: "split",
          direction: "column",
          children: [{ type: "chat" }, { type: "pane", pane: "terminal" }],
          sizes: [0.5, 0.5],
        },
        { type: "pane", pane: "diff" },
      ],
      sizes: [0.6, 0.4],
    });
    store.movePane(refA, "terminal", "diff", "top");
    expect(layoutOf()).toMatchObject({
      direction: "row",
      children: [
        { type: "chat" },
        {
          direction: "column",
          children: [
            { type: "pane", pane: "terminal" },
            { type: "pane", pane: "diff" },
          ],
        },
      ],
    });
    store.movePane(refA, "diff", "chat", "left");
    expect(layoutOf()).toMatchObject({
      direction: "row",
      children: [
        { type: "pane", pane: "diff" },
        { type: "chat" },
        { type: "pane", pane: "terminal" },
      ],
    });
  });

  it("hides a pane keeping its items, and shows it again where it sat", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.open(refA, "terminal");
    store.movePane(refA, "terminal", "chat", "bottom");
    const before = layoutOf();
    store.hidePane(refA, "terminal");
    const hidden = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(hidden.surfaces.map((surface) => surface.id)).toEqual(["diff", "terminal"]);
    expect(hidden.layout).toMatchObject({
      children: [{ type: "chat" }, { type: "pane", pane: "diff" }],
    });
    expect(store.showPane(refA, "terminal")).toBe(true);
    expect(layoutOf()).toEqual(before);
    expect(store.showPane(refA, "device")).toBe(false);
  });

  it("toggles a pane and reopens a closed one at its last position", async () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "files");
    store.open(refA, "diff");
    store.movePane(refA, "diff", "chat", "left");
    const before = layoutOf();
    store.toggle(refA, "diff");
    expect(layoutOf()).toMatchObject({
      children: [{ type: "chat" }, { type: "pane", pane: "files" }],
    });
    store.toggle(refA, "diff");
    expect(layoutOf()).toEqual(before);

    store.closeSurface(refA, "diff");
    expect(layoutOf()).toMatchObject({
      children: [{ type: "chat" }, { type: "pane", pane: "files" }],
    });
    const reopened = await reopenClosedView(useClosedViewStore.getState().entries[0]!, {
      openPreview: () => {
        throw new Error("no browser reopens here");
      },
      workspaceAvailable: true,
    });
    expect(reopened).toBe(true);
    expect(layoutOf()).toEqual(before);
  });

  it("hides every pane at once and keeps the layout for when they come back", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.open(refA, "files");
    const before = layoutOf();
    store.toggleVisibility(refA);
    let state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.isOpen).toBe(false);
    expect(visiblePanes(state)).toEqual([]);
    store.toggleVisibility(refA);
    state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(visiblePanes(state)).toEqual(["diff", "files"]);
    expect(state.layout).toEqual(before);
  });

  it("fills the window with one pane until the layout is restored, and a closed fill ends", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.open(refA, "files");
    store.setFill(refA, "diff");
    expect(
      visiblePanes(selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA)),
    ).toEqual(["diff"]);
    // An automatic open keeps the fill; the user's own open leaves it so the pane can be seen.
    store.openProactive(
      refA,
      { id: "pull-requests", kind: "pull-requests" },
      store.getUserActionRevision(refA),
    );
    expect(selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).fill).toBe(
      "diff",
    );
    store.openFile(refA, "src/a.ts");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).fill,
    ).toBeUndefined();
    store.setFill(refA, "files");
    store.closeSurface(refA, "file:src/a.ts");
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA).fill,
    ).toBeUndefined();
  });

  it("resizes splits and resets a divider, keeping the sizes through a reload", async () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.resizeSplit(refA, [], [0.3, 0.7]);
    expect(layoutOf()).toMatchObject({ sizes: [0.3, 0.7] });
    await reloadRightPanelStore();
    expect(layoutOf()).toMatchObject({ sizes: [0.3, 0.7] });
    useRightPanelStore.getState().resetDivider(refA, [], 0);
    expect(layoutOf()).toMatchObject({ sizes: [0.6, 0.4] });
  });

  it("closing the focused pane's last item focuses the pane left in the layout", () => {
    useRightPanelStore.getState().openBrowser(refA, "tab-a");
    useRightPanelStore.getState().open(refA, "terminal");
    useRightPanelStore.getState().closeSurface(refA, "terminal");

    expect(selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.id).toBe(
      "browser:tab-a",
    );
  });

  it("adds pages opened elsewhere as waiting items that never take over the pane", () => {
    const store = useRightPanelStore.getState();
    const state = () =>
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    store.openBrowser(refA, "stale-tab");
    store.reconcileBrowserSurfaces(refA, ["hidden-tab"]);
    expect(state()).toMatchObject({
      isOpen: false,
      layout: null,
      activeSurfaceId: null,
      surfaces: [{ id: "browser:hidden-tab" }],
      waitingSurfaceIds: ["browser:hidden-tab"],
    });

    store.openBrowser(refA, "shown-tab");
    store.openBrowser(refA, "gone-tab");
    store.reconcileBrowserSurfaces(refA, ["hidden-tab", "shown-tab", "other-tab"]);
    expect(state()).toMatchObject({
      isOpen: true,
      activeSurfaceId: "browser:shown-tab",
      paneSurfaceIds: { browser: "browser:shown-tab" },
      waitingSurfaceIds: ["browser:hidden-tab", "browser:other-tab"],
    });
    expect(state().surfaces.map((surface) => surface.id)).toEqual([
      "browser:hidden-tab",
      "browser:shown-tab",
      "browser:other-tab",
    ]);
  });

  it("removes the browser pane when reconciliation removes its last session tab", () => {
    const store = useRightPanelStore.getState();
    store.openBrowser(refA, "tab-a");
    store.reconcileBrowserSurfaces(refA, []);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({ isOpen: false, layout: null, activeSurfaceId: null, surfaces: [] });

    store.openBrowser(refA, "tab-b");
    store.open(refA, "diff");
    store.reconcileBrowserSurfaces(refA, []);
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA),
    ).toMatchObject({ isOpen: true, activeSurfaceId: "diff" });
  });
  it("opens a new pane under the pane focused before it, not under the last one", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.open(refA, "files");
    store.focusPane(refA, "diff");
    store.open(refA, "terminal");
    expect(layoutOf()).toMatchObject({
      children: [
        { type: "chat" },
        {
          direction: "column",
          children: [{ pane: "diff" }, { pane: "terminal" }, { pane: "files" }],
        },
      ],
    });
  });

  it("moves focus to a pane still on screen when the focused one hides", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.open(refA, "files");
    store.hidePane(refA, "files");
    expect(selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.id).toBe(
      "diff",
    );
  });

  it("keeps focus on a filled pane when an automatic open adds a pane behind it", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "files");
    store.setFill(refA, "files");
    store.openProactive(
      refA,
      { id: "pull-requests", kind: "pull-requests" },
      store.getUserActionRevision(refA),
    );
    expect(selectActiveRightPanelSurface(useRightPanelStore.getState().byThreadKey, refA)?.id).toBe(
      "files",
    );
  });

  it("minimizes a pane to a floating window and restores it to the spot it left", async () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.open(refA, "terminal");
    const before = layoutOf();
    store.minimizePane(refA, "terminal");
    let state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(visiblePanes(state)).toEqual(["diff"]);
    expect(floatingPanes(state)).toEqual(["terminal"]);
    expect(state.activeSurfaceId).toBe("diff");
    store.minimizePane(refA, "diff");
    state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    // Floating windows stack upward in the order they were minimized.
    expect(floatingPanes(state)).toEqual(["terminal", "diff"]);
    expect(state.isOpen).toBe(false);

    await reloadRightPanelStore();
    expect(
      floatingPanes(selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA)),
    ).toEqual(["terminal", "diff"]);

    useRightPanelStore.getState().showPane(refA, "diff");
    useRightPanelStore.getState().showPane(refA, "terminal");
    state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.layout).toEqual(before);
    expect(floatingPanes(state)).toEqual([]);
    expect(state.activeSurfaceId).toBe("terminal");
  });

  it("hides floating windows while a pane fills the window, and closing one drops it", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.open(refA, "terminal");
    store.minimizePane(refA, "terminal");
    store.setFill(refA, "diff");
    let state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(floatingPanes(state)).toEqual([]);
    expect(state.minimized).toEqual(["terminal"]);
    store.setFill(refA, null);
    store.closeSurface(refA, "terminal");
    state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.minimized).toBeUndefined();
  });

  it("floats a browser page, leaving a pane on screen alone when an agent opened it", () => {
    const store = useRightPanelStore.getState();
    store.floatSurface(refA, { id: "browser:tab-a", kind: "preview", resourceId: "tab-a" }, true);
    let state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(floatingPanes(state)).toEqual(["browser"]);
    expect(state.paneSurfaceIds.browser).toBe("browser:tab-a");

    store.openBrowser(refA, "tab-a");
    store.floatSurface(refA, { id: "browser:tab-b", kind: "preview", resourceId: "tab-b" }, true);
    state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(visiblePanes(state)).toEqual(["browser"]);
    expect(state.paneSurfaceIds.browser).toBe("browser:tab-a");
    expect(state.waitingSurfaceIds).toEqual(["browser:tab-b"]);
  });

  it("marks pages opened elsewhere as waiting until the user looks at them", () => {
    const store = useRightPanelStore.getState();
    store.openBrowser(refA, "tab-a");
    store.reconcileBrowserSurfaces(refA, ["tab-a", "tab-b"]);
    let state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.paneSurfaceIds.browser).toBe("browser:tab-a");
    expect(state.waitingSurfaceIds).toEqual(["browser:tab-b"]);
    store.activateSurface(refA, "browser:tab-b");
    state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.waitingSurfaceIds).toBeUndefined();
  });

  it("hides the pane instead of showing a waiting page when its page closes", () => {
    const store = useRightPanelStore.getState();
    const state = () =>
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    store.openBrowser(refA, "tab-a");
    store.reconcileBrowserSurfaces(refA, ["tab-a", "tab-b"]);
    store.closeSurface(refA, "browser:tab-a");
    expect(visiblePanes(state())).toEqual([]);
    expect(state().waitingSurfaceIds).toEqual(["browser:tab-b"]);
    store.reconcileBrowserSurfaces(refA, ["tab-b"]);
    expect(visiblePanes(state())).toEqual([]);
    expect(state().waitingSurfaceIds).toEqual(["browser:tab-b"]);

    store.openBrowser(refA, "tab-c");
    store.reconcileBrowserSurfaces(refA, ["tab-b", "tab-c", "tab-d"]);
    store.minimizePane(refA, "browser");
    store.closeSurface(refA, "browser:tab-c");
    expect(floatingPanes(state())).toEqual([]);
    expect(state().waitingSurfaceIds).toEqual(["browser:tab-b", "browser:tab-d"]);
  });

  it("floats the panes hiding every pane hands off, and puts them back with the layout", () => {
    const store = useRightPanelStore.getState();
    store.open(refA, "diff");
    store.openBrowser(refA, "tab-a");
    const before = layoutOf();
    store.hideAll(refA, ["browser", "device"]);
    let state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.isOpen).toBe(false);
    expect(floatingPanes(state)).toEqual(["browser"]);
    store.show(refA);
    state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(state.layout).toEqual(before);
    expect(floatingPanes(state)).toEqual([]);
    expect(state.floatedOnHide).toBeUndefined();
  });

  it.each([{ fill: false }, { fill: true }])(
    "hiding every pane and showing it again keeps the layout, fill=$fill",
    ({ fill }) => {
      const store = useRightPanelStore.getState();
      store.openDevice(refA, {
        hostId: "local",
        deviceId: "pixel",
        platform: "android",
        name: "Pixel",
      });
      store.openBrowser(refA, "tab-a");
      store.movePane(refA, "browser", "device", "top");
      if (fill) store.setFill(refA, "browser");
      const before = layoutOf();
      store.hideAll(refA, ["browser", "device"]);
      store.show(refA);
      const state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
      expect(state.layout).toEqual(before);
      expect(state.fill).toBe(fill ? "browser" : undefined);
    },
  );

  it("moves a pre-pane terminal tab's shells into the terminal store", () => {
    const migrated = migratePersistedRightPanelState({
      byThreadKey: {
        "env-1:thread-A": {
          isOpen: true,
          activeSurfaceId: "terminal:term-3",
          surfaces: [
            {
              id: "terminal:term-3",
              kind: "terminal",
              resourceId: "term-3",
              terminalIds: ["term-3", "term-4"],
              activeTerminalId: "term-4",
              splitDirection: "vertical",
            },
          ],
        },
      },
    });
    expect(migrated.terminalGroups).toEqual({
      "env-1:thread-A": [
        {
          terminalIds: ["term-3", "term-4"],
          activeTerminalId: "term-4",
          splitDirection: "vertical",
        },
      ],
    });
  });

  it("imports every pre-pane terminal tab's split on upgrade, even while Diff was showing", async () => {
    useTerminalUiStateStore.setState({
      terminalUiStateByThreadKey: {},
      suppressedTerminalIdsByThreadKey: {},
      serverObservationsByThreadKey: {},
    });
    const { storage, name } = useRightPanelStore.persist.getOptions();
    await storage!.setItem(name!, {
      version: 17,
      state: {
        byThreadKey: {
          [scopedThreadKey(refA)]: {
            isOpen: true,
            activeSurfaceId: "diff",
            surfaces: [
              {
                id: "terminal:term-1",
                kind: "terminal",
                resourceId: "term-1",
                terminalIds: ["term-1", "term-2"],
                activeTerminalId: "term-2",
                splitDirection: "vertical",
              },
              { id: "diff", kind: "diff" },
              {
                id: "terminal:term-5",
                kind: "terminal",
                resourceId: "term-5",
                terminalIds: ["term-5"],
                activeTerminalId: "term-5",
              },
            ],
          },
        },
      },
    });
    await useRightPanelStore.persist.rehydrate();

    const state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    expect(visiblePanes(state)).toEqual(["diff"]);
    expect(
      selectThreadTerminalUiState(
        useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
        refA,
      ).terminalGroups,
    ).toMatchObject([
      { terminalIds: ["term-1", "term-2"], splitDirection: "vertical" },
      { terminalIds: ["term-5"] },
    ]);
  });

  it("hands off only the pane a narrow window's sheet shows when the sheet closes", () => {
    const store = useRightPanelStore.getState();
    store.openBrowser(refA, "tab-a");
    store.open(refA, "diff");
    const state = () =>
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, refA);
    // The sheet shows Diff, so closing it floats nothing even though a browser is in the layout.
    expect(sheetPane(state())).toBe("diff");
    store.hideAll(
      refA,
      [sheetPane(state())!].filter((pane) => pane === "browser"),
    );
    expect(floatingPanes(state())).toEqual([]);
    store.show(refA);
    store.focusPane(refA, "browser");
    store.hideAll(refA, [sheetPane(state())!]);
    expect(floatingPanes(state())).toEqual(["browser"]);
  });
});
