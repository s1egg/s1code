import { createMemoryHistory } from "@tanstack/react-router";
import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import type { ScopedThreadRef } from "@s1tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@s1tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { cdp, page, userEvent } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// Loading ChatView takes several seconds; importing it here keeps that out of the test's timeout.
import "~/components/ChatView";
import { useClosedViewStore } from "~/closedViewStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import stylesheet from "~/index.css?inline";
import { reopenClosedView } from "~/reopenClosedView";
import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../../test/fakeEnvironment";
import { act, render } from "../../../test/render";

vi.mock(
  "../../../../../packages/client-runtime/src/connection/driver.ts",
  async (importOriginal) => {
    const [actual, { fakeDriver }, Layer] = await Promise.all([
      importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
      import("../../../test/fakeEnvironment"),
      import("effect/Layer"),
    ]);
    return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
  },
);

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

/** A thread view with the app's stylesheet, so tiles lay out as they do in the app. */
async function mountThread(
  name: string,
  options: { width?: number; seed?: (ref: ScopedThreadRef) => void } = {},
) {
  const style = document.createElement("style");
  style.textContent = stylesheet;
  document.head.append(style);
  await page.viewport(options.width ?? 1400, 900);
  const thread = threadWithHistory(name, 1);
  const environment = installFakeEnvironment([thread]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const ref = scopeThreadRef(ENVIRONMENT_ID, thread.id);
  options.seed?.(ref);
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  const app = await render(<AppRoot router={router} />, {
    // AppRoot brings its own router.
    router: false,
  });
  return {
    ref,
    layout: () =>
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref).layout,
    async [Symbol.asyncDispose]() {
      await app[Symbol.asyncDispose]();
      environment[Symbol.dispose]();
      style.remove();
    },
  };
}

const tile = (id: string) => document.querySelector<HTMLElement>(`[data-pane-tile="${id}"]`);
const rectOf = (id: string) => tile(id)!.getBoundingClientRect();

/** A point inside an element, as fractions of its box. */
function pointIn(element: Element, fx = 0.5, fy = 0.5) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width * fx, y: rect.top + rect.height * fy };
}

// Real input events, so pointer capture and the drag threshold behave as they do for a user.
const mouse = (
  type: "mousePressed" | "mouseMoved" | "mouseReleased",
  point: { x: number; y: number },
) =>
  cdp().send("Input.dispatchMouseEvent", {
    type,
    ...point,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
  });

async function startDrag(chip: Element, to: { x: number; y: number }) {
  const from = pointIn(chip);
  await mouse("mousePressed", from);
  await mouse("mouseMoved", { x: from.x + 8, y: from.y + 8 });
  await mouse("mouseMoved", to);
}

it("title bar icons open panes beside the chat, then under the focused pane, and hide them again", async () => {
  await using view = await mountThread("pane-icons");
  const files = page.getByRole("button", { name: "Files", exact: true });
  await expect.element(files).toHaveAttribute("aria-pressed", "false");
  await files.click();
  await expect.element(files).toHaveAttribute("aria-pressed", "true");
  await vi.waitFor(() => expect(tile("files")).not.toBeNull());
  expect(rectOf("chat").right).toBeLessThanOrEqual(rectOf("files").left + 1);

  await act(() => useRightPanelStore.getState().open(view.ref, "diff"));
  await vi.waitFor(() => expect(tile("diff")).not.toBeNull());
  expect(rectOf("diff").top).toBeGreaterThanOrEqual(rectOf("files").bottom - 1);
  expect(Math.round(rectOf("diff").left)).toBe(Math.round(rectOf("files").left));

  await files.click();
  await expect.element(files).toHaveAttribute("aria-pressed", "false");
  expect(tile("files")).toBeNull();
  expect(view.layout()).toEqual({
    type: "split",
    direction: "row",
    children: [{ type: "chat" }, { type: "pane", pane: "diff" }],
    sizes: [0.6, 0.4],
  });
});

it("dragging a pane's chip docks it on the half of the tile under the pointer", async () => {
  await using view = await mountThread("pane-drag", {
    seed: (ref) => useRightPanelStore.getState().open(ref, "files"),
  });
  await vi.waitFor(() => expect(tile("files")).not.toBeNull());
  const chip = document.querySelector('[data-pane-chip="files"]')!;

  await startDrag(chip, pointIn(tile("chat")!, 0.5, 0.9));
  await expect.element(page.getByText("Move here")).toBeVisible();
  expect(document.querySelector('[data-pane-drop-zone="chat:bottom"]')).not.toBeNull();
  expect(document.querySelector("[data-pane-drag-ghost]")).not.toBeNull();
  await mouse("mouseReleased", pointIn(tile("chat")!, 0.5, 0.9));
  await vi.waitFor(() =>
    expect(view.layout()).toEqual({
      type: "split",
      direction: "column",
      children: [{ type: "chat" }, { type: "pane", pane: "files" }],
      sizes: [0.5, 0.5],
    }),
  );
  expect(document.querySelector("[data-pane-drag-ghost]")).toBeNull();

  await act(() => useRightPanelStore.getState().open(view.ref, "diff"));
  await vi.waitFor(() => expect(tile("diff")).not.toBeNull());
  await startDrag(
    document.querySelector('[data-pane-chip="diff"]')!,
    pointIn(tile("files")!, 0.1, 0.5),
  );
  await expect.element(page.getByText("Move here")).toBeVisible();
  await mouse("mouseReleased", pointIn(tile("files")!, 0.1, 0.5));
  await vi.waitFor(() =>
    expect(view.layout()).toMatchObject({
      direction: "column",
      children: [
        { type: "chat" },
        {
          direction: "row",
          children: [
            { type: "pane", pane: "diff" },
            { type: "pane", pane: "files" },
          ],
        },
      ],
    }),
  );

  // Escape drops the drag where it started.
  const before = view.layout();
  await startDrag(
    document.querySelector('[data-pane-chip="diff"]')!,
    pointIn(tile("chat")!, 0.9, 0.5),
  );
  await expect.element(page.getByText("Move here")).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByText("Move here")).not.toBeInTheDocument();
  await mouse("mouseReleased", pointIn(tile("chat")!, 0.9, 0.5));
  expect(view.layout()).toEqual(before);
});

it("dragging a divider resizes the tiles it separates, and a double-click resets it", async () => {
  await using view = await mountThread("pane-divider", {
    seed: (ref) => useRightPanelStore.getState().open(ref, "files"),
  });
  await vi.waitFor(() => expect(tile("files")).not.toBeNull());
  const divider = document.querySelector('[data-pane-divider=":0"]')!;
  const widthBefore = rectOf("files").width;
  const from = pointIn(divider);
  await mouse("mousePressed", from);
  await mouse("mouseMoved", { x: from.x - 100, y: from.y });
  await mouse("mouseMoved", { x: from.x - 200, y: from.y });
  // The drag only restyles tiles; the layout is saved once, on release.
  expect(view.layout()).toMatchObject({ sizes: [0.6, 0.4] });
  expect(rectOf("files").width).toBeGreaterThan(widthBefore + 150);
  await mouse("mouseReleased", { x: from.x - 200, y: from.y });
  await vi.waitFor(() => {
    const layout = view.layout();
    expect(layout?.type === "split" ? layout.sizes[1] : 0).toBeGreaterThan(0.5);
  });

  await userEvent.dblClick(document.querySelector('[data-pane-divider=":0"]')!);
  await vi.waitFor(() => expect(view.layout()).toMatchObject({ sizes: [0.6, 0.4] }));
});

it("filling the window with a pane hides the chat until Show session restores the layout", async () => {
  await using view = await mountThread("pane-fill", {
    seed: (ref) => useRightPanelStore.getState().open(ref, "files"),
  });
  await page.getByRole("button", { name: "Fill the window with Files" }).click();
  const showSession = page.getByRole("button", { name: "Show session" });
  await expect.element(showSession).toBeVisible();
  await vi.waitFor(() => expect(rectOf("files").left).toBeLessThanOrEqual(rectOf("chat").left + 1));
  expect(document.querySelector('[data-chat-column-maximized-away="true"]')).not.toBeNull();

  await showSession.click();
  await expect.element(showSession).not.toBeInTheDocument();
  expect(document.querySelector('[data-chat-column-maximized-away="true"]')).toBeNull();
  expect(rectOf("chat").right).toBeLessThanOrEqual(rectOf("files").left + 1);
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, view.ref).fill,
  ).toBe(undefined);
});

it("thread details stay docked while panes sit under the chat, and become a popover beside them", async () => {
  await using view = await mountThread("pane-details", {
    seed: (ref) => {
      useRightPanelStore.getState().open(ref, "files");
      useRightPanelStore.getState().movePane(ref, "files", "chat", "bottom");
    },
  });
  const details = page.getByRole("region", { name: "Thread details" });
  await expect.element(details).toBeVisible();

  await act(() => useRightPanelStore.getState().movePane(view.ref, "files", "chat", "right"));
  await expect.element(details).not.toBeInTheDocument();
  await page.getByRole("button", { name: "Toggle thread details panel" }).click();
  await expect.element(page.getByRole("dialog", { name: "Thread details" })).toBeVisible();
});

it("a narrow window shows panes one at a time in a sheet with a pane picker", async () => {
  await using _view = await mountThread("pane-sheet", {
    width: 900,
    seed: (ref) => {
      useRightPanelStore.getState().open(ref, "files");
      useRightPanelStore.getState().open(ref, "diff");
    },
  });
  const picker = page.getByRole("tablist", { name: "Panes" });
  await expect.element(picker).toBeVisible();
  await expect
    .element(picker.getByRole("tab", { name: "Diff" }))
    .toHaveAttribute("aria-selected", "true");
  await picker.getByRole("tab", { name: "Files" }).click();
  await expect
    .element(picker.getByRole("tab", { name: "Files" }))
    .toHaveAttribute("aria-selected", "true");
  expect(document.querySelector("[data-pane-workspace]")).toBeNull();
});

it("Mod+J shows and hides the terminal pane", async () => {
  await using view = await mountThread("pane-terminal");
  const terminal = page.getByRole("button", { name: "Terminal", exact: true });
  await expect.element(terminal).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("composer-editor").click();
  await userEvent.keyboard("{ControlOrMeta>}j{/ControlOrMeta}");
  await expect.element(terminal).toHaveAttribute("aria-pressed", "true");
  expect(view.layout()).toMatchObject({
    children: [{ type: "chat" }, { type: "pane", pane: "terminal" }],
  });
  await userEvent.keyboard("{ControlOrMeta>}j{/ControlOrMeta}");
  await expect.element(terminal).toHaveAttribute("aria-pressed", "false");
});

it("closing a pane from its chip and reopening it puts it back where it was", async () => {
  await using view = await mountThread("pane-reopen", {
    seed: (ref) => {
      useRightPanelStore.getState().open(ref, "files");
      useRightPanelStore.getState().open(ref, "diff");
      useRightPanelStore.getState().movePane(ref, "diff", "chat", "left");
    },
  });
  const before = view.layout();
  await page.getByRole("button", { name: "Close Diff" }).click();
  await vi.waitFor(() => expect(tile("diff")).toBeNull());
  const [closed] = useClosedViewStore.getState().entries;
  expect(closed).toMatchObject({ kind: "panel-tab", surface: { id: "diff" } });
  await act(() =>
    reopenClosedView(closed!, {
      openPreview: () => {
        throw new Error("no browser reopens here");
      },
      workspaceAvailable: true,
    }),
  );
  await vi.waitFor(() => expect(view.layout()).toEqual(before));
  expect(rectOf("diff").right).toBeLessThanOrEqual(rectOf("chat").left + 1);
});
