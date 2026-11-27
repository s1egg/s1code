import { describe, expect, it } from "vite-plus/test";

import {
  computeDividers,
  computeTileRects,
  cornerTile,
  decodeLayout,
  hasPaneRightOfChat,
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
