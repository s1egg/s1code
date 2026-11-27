import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@s1tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@s1tools/contracts/settings";
import { compileResolvedKeybindingsConfig } from "@s1tools/shared/keybindings";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../test/render";

vi.mock(import("../state/server"), async (original) => {
  const actual = await original();
  const { Atom } = await import("effect/reactivity");
  const { compileResolvedKeybindingsConfig: compile } = await import("@s1tools/shared/keybindings");
  // One key toggles Usage: it opens Usage elsewhere and goes back from it.
  const compiled = compile([
    { key: "mod+u", command: "navigation.back", when: "usagePageOpen" },
    { key: "mod+u", command: "usage.open", when: "!usagePageOpen" },
  ]);
  return { ...actual, primaryServerKeybindingsAtom: Atom.make(compiled) };
});

import { getClientSettings, __setClientSettingsForTests } from "../hooks/useSettings";
import { useCommandPaletteMount } from "../commandPaletteStore";
import { installCommandPaletteCommands } from "../shortcuts/commandPaletteCommands";
import { registerNavigationHistoryCommands } from "./AppSidebarLayout";
import { isThreadDetailsDrillInShown, useThreadDetailsStore } from "./chat/threadDetailsStore";

const threadRef = scopeThreadRef(EnvironmentId.make("env-1"), ThreadId.make("thread-1"));
const backFromUsage = compileResolvedKeybindingsConfig([
  { key: "mod+u", command: "navigation.back", when: "usagePageOpen" },
  { key: "mod+u", command: "usage.open", when: "!usagePageOpen" },
]);
const toggleUsage = compileResolvedKeybindingsConfig([{ key: "mod+u", command: "usage.open" }]);

function MountedPalette() {
  useCommandPaletteMount();
  return null;
}

/** A thread route, where the thread sidebar lives. */
function threadRouter() {
  const root = createRootRoute();
  const thread = createRoute({ getParentRoute: () => root, path: "$environmentId/$threadId" });
  return createRouter({
    routeTree: root.addChildren([thread]),
    history: createMemoryHistory({ initialEntries: ["/env-1/thread-1"] }),
  });
}

function attachSidebar(presentation: "docked" | "popover") {
  const attached = { threadRef, presentation };
  useThreadDetailsStore.setState({ drillIn: null, popoverOpen: false, openedForDrillIn: false });
  useThreadDetailsStore.getState().attach(attached);
  return { [Symbol.dispose]: () => useThreadDetailsStore.getState().detach(attached) };
}

describe("usage toggle shortcut", () => {
  // regression: #21357
  it("goes back from Usage with a binding that reads it as open", async () => {
    using _platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    using _sidebar = attachSidebar("popover");
    useThreadDetailsStore.setState({ drillIn: "usage", popoverOpen: true });
    const router = threadRouter();
    await router.load();
    using _commands = { [Symbol.dispose]: registerNavigationHistoryCommands(router) };

    using back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    await userEvent.keyboard("{Control>}u{/Control}");

    expect(back).toHaveBeenCalledOnce();
  });

  // Both listeners sit on window, so the palette must not claim the key whatever their order.
  it("does not reopen Usage from the command palette", async () => {
    using _platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    using _sidebar = attachSidebar("popover");
    useThreadDetailsStore.setState({ drillIn: "usage", popoverOpen: true });
    await using screen = await render(<MountedPalette />);
    using navigate = vi.spyOn(screen.router!, "navigate");
    using commands = new DisposableStack();
    commands.defer(
      installCommandPaletteCommands(screen.router!, { keybindings: () => backFromUsage }),
    );

    await userEvent.keyboard("{Control>}u{/Control}");

    expect(navigate).not.toHaveBeenCalled();
    expect(useThreadDetailsStore.getState()).toMatchObject({ drillIn: "usage", popoverOpen: true });
  });

  it("opens the docked sidebar on Usage and closes it again", async () => {
    using _platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    __setClientSettingsForTests({ ...DEFAULT_CLIENT_SETTINGS, threadDetailsOpen: false });
    using _sidebar = attachSidebar("docked");
    await using _screen = await render(<MountedPalette />, { router: false });
    const router = threadRouter();
    await router.load();
    using commands = new DisposableStack();
    commands.defer(installCommandPaletteCommands(router, { keybindings: () => toggleUsage }));

    await userEvent.keyboard("{Control>}u{/Control}");
    await expect.poll(() => isThreadDetailsDrillInShown("usage")).toBe(true);
    expect(getClientSettings().threadDetailsOpen).toBe(true);

    await userEvent.keyboard("{Control>}u{/Control}");
    await expect.poll(() => getClientSettings().threadDetailsOpen).toBe(false);
    expect(useThreadDetailsStore.getState().drillIn).toBeNull();
  });
});
