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
import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import { reopenClosedView } from "~/reopenClosedView";
import { deviceSurface, selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "~/terminalUiStateStore";
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
  options: {
    width?: number;
    height?: number;
    seed?: (ref: ScopedThreadRef) => void;
  } = {},
) {
  const style = document.createElement("style");
  style.textContent = stylesheet;
  document.head.append(style);
  await page.viewport(options.width ?? 1400, options.height ?? 900);
  const thread = threadWithHistory(name, 1);
  const environment = installFakeEnvironment([thread]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    confirmTerminalClose: false,
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

const floatingWindow = (pane: string) =>
  document.querySelector<HTMLElement>(`[data-pane-floating="${pane}"]`);

const terminalIds = (ref: ScopedThreadRef) =>
  selectThreadTerminalUiState(useTerminalUiStateStore.getState().terminalUiStateByThreadKey, ref)
    .terminalIds;
const activeSurfaceId = (ref: ScopedThreadRef) =>
  selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, ref).activeSurfaceId;

// First in the file: threads a file mounts after its first get no terminal views from the fake
// environment.
it("a terminal takes pane commands when focused or pressed, and keeps floating while it splits", async () => {
  await using view = await mountThread("pane-terminal-commands");
  await page.getByTestId("composer-editor").click();
  await userEvent.keyboard("{ControlOrMeta>}j{/ControlOrMeta}");
  await vi.waitFor(() => expect(terminalIds(view.ref)).toHaveLength(1));
  const inputIn = (container: () => HTMLElement | null) =>
    vi.waitFor(() => {
      const element = container()?.querySelector<HTMLElement>("textarea");
      expect(element).toBeTruthy();
      return element!;
    });

  // The terminal's views render through a portal owned outside the pane's React tree.
  const tiled = await inputIn(() => tile("terminal"));
  await act(() => useRightPanelStore.getState().open(view.ref, "files"));
  await act(() => document.querySelector<HTMLElement>('[data-pane-chip="files"]')!.focus());
  expect(activeSurfaceId(view.ref)).toBe("files");
  await act(() => tiled.focus());
  expect(activeSurfaceId(view.ref)).toBe("terminal");
  await act(() => document.querySelector<HTMLElement>('[data-pane-chip="files"]')!.focus());
  expect(activeSurfaceId(view.ref)).toBe("files");
  const point = pointIn(tile("terminal")!, 0.5, 0.6);
  await mouse("mousePressed", point);
  await mouse("mouseReleased", point);
  await vi.waitFor(() => expect(activeSurfaceId(view.ref)).toBe("terminal"));

  // The views move with the pane, and fit whatever holds them.
  const canvasFits = (container: () => HTMLElement | null) =>
    vi.waitFor(() => {
      const holder = container()!.querySelector<HTMLElement>("[data-right-panel-surface-content]")!;
      const canvas = holder.querySelector("canvas")!.getBoundingClientRect();
      const room = holder.getBoundingClientRect();
      expect(canvas.width).toBeGreaterThan(room.width / 2);
      expect(canvas.width).toBeLessThanOrEqual(room.width + 1);
      expect(canvas.height).toBeGreaterThan(room.height / 2);
      expect(canvas.height).toBeLessThanOrEqual(room.height + 1);
    });
  await act(() => useRightPanelStore.getState().minimizePane(view.ref, "terminal"));
  await canvasFits(() => floatingWindow("terminal"));
  await act(async () => (await inputIn(() => floatingWindow("terminal"))).focus());
  await userEvent.keyboard("{ControlOrMeta>}d{/ControlOrMeta}");
  await vi.waitFor(() => expect(terminalIds(view.ref)).toHaveLength(2));
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, view.ref).minimized,
  ).toEqual(["terminal"]);
  expect(tile("terminal")).toBeNull();
  const focused = await vi.waitFor(() => {
    const element = floatingWindow("terminal")?.querySelector<HTMLElement>("textarea:focus");
    expect(element).toBeTruthy();
    return element!;
  });
  await act(() => focused.focus());
  await userEvent.keyboard("{ControlOrMeta>}w{/ControlOrMeta}");
  await vi.waitFor(() => expect(terminalIds(view.ref)).toHaveLength(1));

  await page.getByRole("button", { name: "Restore Terminal" }).click();
  await vi.waitFor(() => expect(tile("terminal")).not.toBeNull());
  await canvasFits(() => tile("terminal"));
});

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

it("a divider leaves the chat its minimum width beside docked thread details", async () => {
  await using _view = await mountThread("pane-divider-details", {
    seed: (ref) => {
      useRightPanelStore.getState().open(ref, "files");
      useRightPanelStore.getState().movePane(ref, "files", "chat", "left");
    },
  });
  await expect.element(page.getByRole("region", { name: "Thread details" })).toBeVisible();
  const details = document.querySelector('[data-thread-details-panel="docked"]')!;
  const from = pointIn(document.querySelector('[data-pane-divider=":0"]')!);
  await mouse("mousePressed", from);
  await mouse("mouseMoved", { x: from.x + 100, y: from.y });
  await mouse("mouseMoved", { x: window.innerWidth - 5, y: from.y });
  await mouse("mouseReleased", { x: window.innerWidth - 5, y: from.y });
  await vi.waitFor(() =>
    expect(rectOf("chat").width - details.getBoundingClientRect().width).toBeGreaterThanOrEqual(
      319,
    ),
  );
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

it("minimizing panes floats them in the chat's corner, stacked, until restored or closed", async () => {
  await using view = await mountThread("pane-minimize", {
    seed: (ref) => {
      useRightPanelStore.getState().open(ref, "files");
      useRightPanelStore.getState().open(ref, "diff");
    },
  });
  await page.getByRole("button", { name: "Minimize Files" }).click();
  await vi.waitFor(() => expect(floatingWindow("files")).not.toBeNull());
  expect(tile("files")).toBeNull();
  const chat = rectOf("chat");
  const files = floatingWindow("files")!.getBoundingClientRect();
  expect(files.right).toBeLessThanOrEqual(chat.right);
  expect(files.bottom).toBeLessThanOrEqual(chat.bottom);
  expect(files.left).toBeGreaterThan(chat.left + chat.width / 3);

  await page.getByRole("button", { name: "Minimize Diff" }).click();
  await vi.waitFor(() => expect(floatingWindow("diff")).not.toBeNull());
  // The newer window stacks above the older one.
  expect(floatingWindow("diff")!.getBoundingClientRect().bottom).toBeLessThanOrEqual(
    floatingWindow("files")!.getBoundingClientRect().top,
  );
  // With no pane right of the chat, thread details dock there; the windows stay in the chat column.
  const details = await vi.waitFor(() => {
    const element = document.querySelector('[data-thread-details-panel="docked"]');
    expect(element).not.toBeNull();
    return element!.getBoundingClientRect();
  });
  for (const pane of ["files", "diff"]) {
    expect(floatingWindow(pane)!.getBoundingClientRect().right).toBeLessThanOrEqual(details.left);
  }

  await page.getByRole("button", { name: "Restore Files" }).click();
  await vi.waitFor(() => expect(tile("files")).not.toBeNull());
  expect(floatingWindow("files")).toBeNull();

  await page.getByRole("button", { name: "Close Diff" }).click();
  await vi.waitFor(() => expect(floatingWindow("diff")).toBeNull());
  const state = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, view.ref);
  expect(state.surfaces.map((surface) => surface.id)).toEqual(["files"]);
});

it("keeps the title bar icons in the chat's header, and on a filled pane's header while it fills", async () => {
  await using view = await mountThread("pane-titlebar", {
    seed: (ref) => useRightPanelStore.getState().open(ref, "files"),
  });
  await vi.waitFor(() => expect(tile("files")).not.toBeNull());
  const controls = () => document.querySelector("[data-panel-layout-controls]");
  expect(controls()?.closest("[data-chat-header]")).not.toBeNull();
  expect(
    document.querySelector('[data-pane-header="files"] [data-panel-layout-controls]'),
  ).toBeNull();

  await act(() => useRightPanelStore.getState().setFill(view.ref, "files"));
  await vi.waitFor(() => expect(controls()?.closest('[data-pane-header="files"]')).not.toBeNull());
  expect(document.querySelector("[data-chat-header] [data-panel-layout-controls]")).toBeNull();
});

it("focus arriving in a pane by keyboard makes it the pane that pane commands act on", async () => {
  await using view = await mountThread("pane-focus", {
    seed: (ref) => {
      useRightPanelStore.getState().open(ref, "diff");
      useRightPanelStore.getState().open(ref, "files");
    },
  });
  await vi.waitFor(() => expect(tile("diff")).not.toBeNull());
  await act(() => document.querySelector<HTMLElement>('[data-pane-chip="diff"]')!.focus());
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, view.ref)
      .activeSurfaceId,
  ).toBe("diff");
});

it("a narrow window's sheet switches and closes single items, and lists minimized panes", async () => {
  await using view = await mountThread("pane-sheet-items", {
    width: 900,
    seed: (ref) => {
      useRightPanelStore.getState().openFile(ref, "src/a.ts");
      useRightPanelStore.getState().openFile(ref, "src/b.ts");
      useRightPanelStore.getState().open(ref, "diff");
      useRightPanelStore.getState().minimizePane(ref, "diff");
    },
  });
  const picker = page.getByRole("tablist", { name: "Panes" });
  await expect.element(picker).toBeVisible();
  await page.getByRole("button", { name: "Switch item" }).click();
  await page.getByRole("menuitem", { name: "Close this item" }).click();
  await vi.waitFor(() =>
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, view.ref).surfaces.map(
        (surface) => surface.id,
      ),
    ).toEqual(["file:src/a.ts", "diff"]),
  );

  const diff = document.querySelector<HTMLElement>('[data-pane-sheet-tab="diff"]')!;
  expect(diff.dataset.minimized).toBe("true");
  await userEvent.click(diff);
  await vi.waitFor(() =>
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, view.ref).minimized,
    ).toBeUndefined(),
  );
  await expect
    .element(picker.getByRole("tab", { name: "Diff" }))
    .toHaveAttribute("aria-selected", "true");
});

const floatDevice = (ref: ScopedThreadRef) =>
  useRightPanelStore
    .getState()
    .floatSurface(
      ref,
      deviceSurface({ hostId: "local", deviceId: "pixel", platform: "android", name: "Pixel" }),
    );

it("minimized panes stack over the composer while the floating preview sits up top", async () => {
  await using _view = await mountThread("pane-floating-preview-top", {
    seed: (ref) => {
      useRightPanelStore.getState().open(ref, "files");
      useRightPanelStore.getState().minimizePane(ref, "files");
      floatDevice(ref);
      usePreviewMiniPlayerStore.getState().move(ref, { x: 10_000, y: 0 });
    },
  });
  await vi.waitFor(() => expect(floatingWindow("files")?.checkVisibility()).toBe(true), {
    timeout: 5000,
  });
  const chat = rectOf("chat");
  const files = floatingWindow("files")!.getBoundingClientRect();
  expect(files.top).toBeGreaterThanOrEqual(chat.top + 48);
  expect(files.bottom).toBeLessThanOrEqual(chat.bottom);
});

it("the minimized pane picker stays below the chat's header when a tall preview floats under it", async () => {
  await using _view = await mountThread("pane-floating-preview-tall", {
    height: 560,
    seed: (ref) => {
      useRightPanelStore.getState().open(ref, "files");
      useRightPanelStore.getState().minimizePane(ref, "files");
      floatDevice(ref);
    },
  });
  const more = page.getByRole("button", { name: "1 more minimized pane" });
  await expect.element(more).toBeInTheDocument();
  const chat = rectOf("chat");
  const moreRect = more.element().getBoundingClientRect();
  expect(moreRect.top).toBeGreaterThanOrEqual(chat.top + 48);
  expect(moreRect.bottom).toBeLessThanOrEqual(chat.bottom);
});

it("a short chat keeps every minimized pane reachable, folding the ones that do not fit", async () => {
  await using view = await mountThread("pane-floating-overflow", {
    height: 560,
    seed: (ref) => {
      for (const pane of ["files", "diff", "terminal"] as const) {
        useRightPanelStore.getState().open(ref, pane);
        useRightPanelStore.getState().minimizePane(ref, pane);
      }
    },
  });
  const titles = { files: "Files", diff: "Diff", terminal: "Terminal" } as const;
  const panes = ["files", "diff", "terminal"] as const;
  await vi.waitFor(() => expect(floatingWindow("files")).not.toBeNull());
  const chat = rectOf("chat");
  const shown = panes.filter((pane) => floatingWindow(pane)?.checkVisibility() === true);
  for (const pane of shown) {
    const rect = floatingWindow(pane)!.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(chat.top);
    expect(rect.bottom).toBeLessThanOrEqual(chat.bottom);
  }
  const folded = panes.filter((pane) => !shown.includes(pane));
  expect(folded.length).toBeGreaterThan(0);
  const more = page.getByRole("button", {
    name: `${folded.length} more minimized pane${folded.length === 1 ? "" : "s"}`,
  });
  const moreRect = more.element().getBoundingClientRect();
  expect(moreRect.top).toBeGreaterThanOrEqual(chat.top);
  await more.click();
  const restored = folded[0]!;
  await page.getByRole("menuitem", { name: titles[restored], exact: true }).click();
  await vi.waitFor(() => expect(tile(restored)).not.toBeNull());
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, view.ref).minimized,
  ).not.toContain(restored);
});
