import "~/index.css";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarRailEntry, SidebarRailStatus } from "../Sidebar.logic";
import { SidebarProjectRail } from "./SidebarProjectRail";

vi.mock("./SidebarChrome", () => ({ SidebarRailUtilities: () => null }));

function rail(selectedKey: string | null, statuses: ReadonlyArray<SidebarRailStatus>) {
  const entries: SidebarRailEntry<SidebarProjectSnapshot>[] = statuses.map((status, index) => ({
    key: `entry-${index}`,
    group: null,
    projectKeys: new Set(),
    status,
  }));
  return (
    <SidebarProjectRail
      entries={entries}
      selectedKey={selectedKey}
      onSelect={vi.fn()}
      onProjectContextMenu={vi.fn()}
      onAddProject={vi.fn()}
    />
  );
}

it("moves one selection bar to the selected tile", async () => {
  await using screen = await render(rail("entry-0", [null, null, null]));
  const bars = () => screen.container.querySelectorAll<HTMLElement>("[data-rail-selection-bar]");
  const centerY = (element: Element) => {
    const rect = element.getBoundingClientRect();
    return rect.top + rect.height / 2;
  };
  const tiles = screen.container.querySelectorAll("button[aria-pressed]");
  expect(bars()).toHaveLength(1);
  const bar = bars()[0]!;
  expect(centerY(bar)).toBeCloseTo(centerY(tiles[0]!), 0);

  await screen.rerender(rail("entry-2", [null, null, null]));
  expect(bars()).toHaveLength(1);
  // The same element moves, so the change transitions instead of popping.
  expect(bars()[0]).toBe(bar);
  for (const animation of bar.getAnimations()) animation.finish();
  expect(centerY(bar)).toBeCloseTo(centerY(tiles[2]!), 0);

  await screen.rerender(rail(null, [null, null, null]));
  expect(bars()).toHaveLength(0);
});

it("twinkles the running badge once when a project starts running, not on mount", async () => {
  await using screen = await render(rail(null, ["running", null]));
  const glyphs = () => screen.container.querySelectorAll<SVGElement>('[data-run-glyph="running"]');
  expect(glyphs()).toHaveLength(1);
  expect(glyphs()[0]!.hasAttribute("data-twinkle")).toBe(false);

  await screen.rerender(rail(null, ["running", "running"]));
  const started = glyphs()[1]!;
  expect(started.hasAttribute("data-twinkle")).toBe(true);
  expect(glyphs()[0]!.hasAttribute("data-twinkle")).toBe(false);

  await act(() => started.dispatchEvent(new AnimationEvent("animationend", { bubbles: true })));
  expect(started.hasAttribute("data-twinkle")).toBe(false);
});
