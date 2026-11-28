import { describe, expect, it } from "vite-plus/test";

import {
  computeDividers,
  computeTileRects,
  cornerTile,
  decodeLayout,
  dividerMinimums,
  hasPaneRightOfChat,
  minNodeSize,
  movePane,
  placePane,
  removeTile,
  splitTile,
  type LayoutNode,
} from "./paneLayout";

const chatWithDiff: LayoutNode = {
  type: "split",
  direction: "row",
  children: [{ type: "chat" }, { type: "pane", pane: "diff" }],
  sizes: [0.6, 0.4],
};

describe("paneLayout", () => {
  it("splits a tile in place, or beside its siblings when the parent runs the same way", () => {
    expect(splitTile(chatWithDiff, "diff", "terminal", "bottom", 0.5)).toEqual({
      type: "split",
      direction: "row",
      children: [
        { type: "chat" },
        {
          type: "split",
          direction: "column",
          children: [
            { type: "pane", pane: "diff" },
            { type: "pane", pane: "terminal" },
          ],
          sizes: [0.5, 0.5],
        },
      ],
      sizes: [0.6, 0.4],
    });
    expect(splitTile(chatWithDiff, "chat", "files", "left", 0.5)).toEqual({
      type: "split",
      direction: "row",
      children: [{ type: "pane", pane: "files" }, { type: "chat" }, { type: "pane", pane: "diff" }],
      sizes: [0.3, 0.3, 0.4],
    });
  });

  it("removes a pane into its neighbour and remembers where it sat", () => {
    const withTerminal = splitTile(chatWithDiff, "chat", "terminal", "bottom", 0.3);
    const { layout, placement } = removeTile(withTerminal, "terminal");
    expect(layout).toEqual(chatWithDiff);
    expect(placement).toEqual({ neighbor: "chat", side: "bottom", ratio: 0.3 });
    expect(placePane(layout, "terminal", { focused: "diff", placement: placement! })).toEqual(
      withTerminal,
    );
    expect(removeTile(chatWithDiff, "diff").layout).toBeNull();
  });

  it("puts a pane back beside the whole split it sat next to", () => {
    // Chat above Terminal, with a full-height Diff on the right.
    const nested: LayoutNode = {
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
    };
    const removed = removeTile(nested, "diff");
    expect(removed.placement).toEqual({
      neighbor: "chat",
      side: "right",
      ratio: 0.4,
      group: ["chat", "terminal"],
    });
    expect(
      placePane(removed.layout, "diff", { focused: null, placement: removed.placement! }),
    ).toEqual(nested);
    // A neighbour split that lost a tile still takes the pane back beside what is left of it.
    const withFiles = splitTile(nested, "terminal", "files", "bottom", 0.5);
    const removedBeside = removeTile(withFiles, "diff");
    expect(
      placePane(removeTile(removedBeside.layout, "files").layout, "diff", {
        focused: null,
        placement: removedBeside.placement!,
      }),
    ).toMatchObject({ direction: "row", children: [{ direction: "column" }, { pane: "diff" }] });
  });

  it("needs the room every tile of a split needs before a divider can shrink it", () => {
    const layout = splitTile(chatWithDiff, "diff", "terminal", "right", 0.5);
    expect(minNodeSize(layout, "width")).toBe(320 + 220 + 220);
    expect(minNodeSize(splitTile(null, "chat", "terminal", "bottom", 0.5), "height")).toBe(
      240 + 120,
    );
    expect(minNodeSize(layout, "height")).toBe(240);
  });

  it("keeps both neighbors' minimums while they fit, and shares the room when they do not", () => {
    // The larger subtree needs more than half the pair; the divider must still respect it.
    expect(dividerMinimums(0.6, 0.2, 1)).toEqual([0.6, 0.2]);
    expect(dividerMinimums(0.2, 0.7, 1)).toEqual([0.2, 0.7]);
    const [before, after] = dividerMinimums(0.8, 0.4, 0.9);
    expect(before + after).toBeCloseTo(0.9);
    expect(before / after).toBeCloseTo(2);
  });

  it("places by default beside the chat first and under the focused pane after", () => {
    expect(placePane(null, "diff", { focused: null, placement: undefined })).toEqual(chatWithDiff);
    expect(
      placePane(chatWithDiff, "files", {
        focused: "diff",
        // A remembered neighbour that is gone falls back to the default.
        placement: { neighbor: "terminal", side: "left", ratio: 0.5 },
      }),
    ).toMatchObject({
      children: [
        { type: "chat" },
        { direction: "column", children: [{ pane: "diff" }, { pane: "files" }] },
      ],
    });
  });

  it("moves a pane by removing it and splitting the target, and ignores a drop on itself", () => {
    expect(movePane(chatWithDiff, "diff", "chat", "bottom")).toEqual({
      type: "split",
      direction: "column",
      children: [{ type: "chat" }, { type: "pane", pane: "diff" }],
      sizes: [0.5, 0.5],
    });
    expect(movePane(chatWithDiff, "diff", "diff", "left")).toBe(chatWithDiff);
  });

  it("lays tiles and dividers out as fractions of the content area", () => {
    const layout = splitTile(chatWithDiff, "diff", "terminal", "bottom", 0.5);
    const rects = computeTileRects(layout);
    expect(rects.get("chat")).toEqual({ x: 0, y: 0, width: 0.6, height: 1 });
    expect(rects.get("terminal")).toEqual({ x: 0.6, y: 0.5, width: 0.4, height: 0.5 });
    expect(
      computeDividers(layout).map(({ path, index, direction }) => [path, index, direction]),
    ).toEqual([
      [[], 0, "row"],
      [[1], 0, "column"],
    ]);
    expect(cornerTile(layout, "top-right")).toBe("diff");
    expect(cornerTile(layout, "top-left")).toBe("chat");
    expect(hasPaneRightOfChat(layout)).toBe(true);
    expect(hasPaneRightOfChat(movePane(layout, "diff", "chat", "bottom"))).toBe(true);
    expect(
      hasPaneRightOfChat(
        removeTile(movePane(chatWithDiff, "diff", "chat", "bottom"), "diff").layout,
      ),
    ).toBe(false);
  });

  it("decodes only trees with one chat leaf and no repeated pane", () => {
    expect(decodeLayout(chatWithDiff)).toEqual(chatWithDiff);
    expect(
      decodeLayout({
        ...chatWithDiff,
        children: [
          { type: "pane", pane: "diff" },
          { type: "pane", pane: "diff" },
        ],
      }),
    ).toBeNull();
    expect(
      decodeLayout({
        ...chatWithDiff,
        children: [{ type: "chat" }, { type: "pane", pane: "hologram" }],
      }),
    ).toBeNull();
    expect(decodeLayout({ ...chatWithDiff, sizes: [1, 0] })).toBeNull();
    expect(decodeLayout({ type: "chat" })).toBeNull();
  });
});
