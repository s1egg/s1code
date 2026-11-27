/**
 * The tiling tree a thread's panes are arranged in. Exactly one leaf is the chat; every other
 * leaf is one pane, and a pane kind appears at most once. Sizes are fractions of the parent
 * split and sum to 1, so the tree reflows with the window instead of remembering pixels.
 */

export const PANE_KINDS = [
  "terminal",
  "diff",
  "browser",
  "files",
  "pull-request",
  "linked",
  "issue",
  "device",
  "thread",
] as const;
export type PaneKind = (typeof PANE_KINDS)[number];
export type TileId = "chat" | PaneKind;
export type PaneSide = "left" | "right" | "top" | "bottom";
export type SplitDirection = "row" | "column";

export type LayoutNode =
  | { type: "split"; direction: SplitDirection; children: LayoutNode[]; sizes: number[] }
  | { type: "chat" }
  | { type: "pane"; pane: PaneKind };

/** Where a pane sat when it left the layout, so showing it again puts it back there. */
export interface PanePlacement {
  neighbor: TileId;
  side: PaneSide;
  /** The pane's share of the space it and its neighbor took. */
  ratio: number;
}

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutDivider {
  /** Child indices from the root to the split. */
  path: number[];
  /** The divider sits after this child. */
  index: number;
  direction: SplitDirection;
  rect: TileRect;
  splitRect: TileRect;
}

/** The pane's share of the chat row when the first pane opens. */
const DEFAULT_PANE_RATIO = 0.4;
const CHAT_LEAF: LayoutNode = { type: "chat" };

export const isPaneKind = (value: unknown): value is PaneKind =>
  (PANE_KINDS as ReadonlyArray<unknown>).includes(value);

const leafId = (node: LayoutNode): TileId | null =>
  node.type === "chat" ? "chat" : node.type === "pane" ? node.pane : null;

function layoutTiles(layout: LayoutNode | null): TileId[] {
  if (layout === null) return ["chat"];
  const id = leafId(layout);
  if (id !== null) return [id];
  return layout.type === "split" ? layout.children.flatMap(layoutTiles) : [];
}

export function layoutPanes(layout: LayoutNode | null): PaneKind[] {
  return layoutTiles(layout).filter((id): id is PaneKind => id !== "chat");
}

export const layoutHasTile = (layout: LayoutNode | null, id: TileId) =>
  layoutTiles(layout).includes(id);

function findPath(node: LayoutNode, id: TileId, path: number[] = []): number[] | null {
  if (leafId(node) === id) return path;
  if (node.type !== "split") return null;
  for (const [index, child] of node.children.entries()) {
    const found = findPath(child, id, [...path, index]);
    if (found) return found;
  }
  return null;
}

function nodeAt(node: LayoutNode, path: readonly number[]): LayoutNode | null {
  let current: LayoutNode | undefined = node;
  for (const index of path) {
    if (current?.type !== "split") return null;
    current = current.children[index];
  }
  return current ?? null;
}

function replaceAt(
  node: LayoutNode,
  path: readonly number[],
  replace: (node: LayoutNode) => LayoutNode,
): LayoutNode {
  if (path.length === 0) return replace(node);
  if (node.type !== "split") return node;
  const [index, ...rest] = path;
  return {
    ...node,
    children: node.children.map((child, i) =>
      i === index ? replaceAt(child, rest, replace) : child,
    ),
  };
}

function normalizeSizes(sizes: readonly number[]): number[] {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (!(total > 0)) return sizes.map(() => 1 / sizes.length);
  return sizes.map((size) => size / total);
}

/** Collapses single-child splits and merges a split into a parent running the same way. */
function simplify(node: LayoutNode): LayoutNode {
  if (node.type !== "split") return node;
  const children: LayoutNode[] = [];
  const sizes: number[] = [];
  for (const [index, raw] of node.children.entries()) {
    const child = simplify(raw);
    const size = node.sizes[index] ?? 0;
    if (child.type === "split" && child.direction === node.direction) {
      children.push(...child.children);
      sizes.push(...child.sizes.map((share) => share * size));
    } else {
      children.push(child);
      sizes.push(size);
    }
  }
  if (children.length === 1) return children[0]!;
  return { ...node, children, sizes: normalizeSizes(sizes) };
}

const directionOf = (side: PaneSide): SplitDirection =>
  side === "left" || side === "right" ? "row" : "column";
const sideBefore = (side: PaneSide) => side === "left" || side === "top";

/** Puts `pane` beside `target`, taking `ratio` of the target's space. */
export function splitTile(
  layout: LayoutNode | null,
  target: TileId,
  pane: PaneKind,
  side: PaneSide,
  ratio: number,
): LayoutNode {
  const root = layout ?? CHAT_LEAF;
  const path = findPath(root, target);
  if (path === null) return root;
  const leaf: LayoutNode = { type: "pane", pane };
  const before = sideBefore(side);
  const share = Math.min(0.9, Math.max(0.1, ratio));
  const direction = directionOf(side);
  const parentPath = path.slice(0, -1);
  const parent = path.length > 0 ? nodeAt(root, parentPath) : null;
  if (parent?.type === "split" && parent.direction === direction) {
    const index = path.at(-1)!;
    return replaceAt(root, parentPath, (node) => {
      if (node.type !== "split") return node;
      const size = node.sizes[index] ?? 0;
      const children = [...node.children];
      const sizes = [...node.sizes];
      const targetNode = children[index]!;
      children.splice(index, 1, ...(before ? [leaf, targetNode] : [targetNode, leaf]));
      sizes.splice(
        index,
        1,
        ...(before ? [size * share, size * (1 - share)] : [size * (1 - share), size * share]),
      );
      return { ...node, children, sizes };
    });
  }
  return replaceAt(root, path, (targetNode) => ({
    type: "split",
    direction,
    children: before ? [leaf, targetNode] : [targetNode, leaf],
    sizes: before ? [share, 1 - share] : [1 - share, share],
  }));
}

function firstLeaf(node: LayoutNode): TileId {
  const tiles = layoutTiles(node);
  return tiles.includes("chat") ? "chat" : tiles[0]!;
}

/** Removes a pane, giving its space to the sibling it sat beside, and says where it was. */
export function removeTile(
  layout: LayoutNode | null,
  pane: PaneKind,
): { layout: LayoutNode | null; placement: PanePlacement | null } {
  if (layout === null) return { layout, placement: null };
  const path = findPath(layout, pane);
  if (path === null || path.length === 0) return { layout, placement: null };
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(layout, parentPath);
  if (parent?.type !== "split") return { layout, placement: null };
  const index = path.at(-1)!;
  const siblingIndex = index > 0 ? index - 1 : 1;
  const sibling = parent.children[siblingIndex]!;
  const paneSize = parent.sizes[index] ?? 0;
  const siblingSize = parent.sizes[siblingIndex] ?? 0;
  const after = index > 0;
  const placement: PanePlacement = {
    neighbor: firstLeaf(sibling),
    side: parent.direction === "row" ? (after ? "right" : "left") : after ? "bottom" : "top",
    ratio: paneSize + siblingSize > 0 ? paneSize / (paneSize + siblingSize) : 0.5,
  };
  const next = simplify(
    replaceAt(layout, parentPath, (node) => {
      if (node.type !== "split") return node;
      const sizes = node.sizes.map((size, i) => (i === siblingIndex ? size + paneSize : size));
      return {
        ...node,
        children: node.children.filter((_, i) => i !== index),
        sizes: sizes.filter((_, i) => i !== index),
      };
    }),
  );
  return { layout: next.type === "chat" ? null : next, placement };
}

/**
 * Where a pane goes when it is shown: back where it last was, else beside the chat for the
 * first pane, else under the pane the user last worked in.
 */
export function placePane(
  layout: LayoutNode | null,
  pane: PaneKind,
  options: { focused: PaneKind | null; placement: PanePlacement | undefined },
): LayoutNode {
  if (layoutHasTile(layout, pane)) return layout!;
  const { placement } = options;
  if (placement && layoutHasTile(layout, placement.neighbor)) {
    return splitTile(layout, placement.neighbor, pane, placement.side, placement.ratio);
  }
  const panes = layoutPanes(layout);
  if (panes.length === 0) return splitTile(layout, "chat", pane, "right", DEFAULT_PANE_RATIO);
  const target =
    options.focused !== null && panes.includes(options.focused) ? options.focused : panes.at(-1)!;
  return splitTile(layout, target, pane, "bottom", 0.5);
}

/** Moves a pane to one side of another tile; dropping only ever splits. */
export function movePane(
  layout: LayoutNode | null,
  pane: PaneKind,
  target: TileId,
  side: PaneSide,
): LayoutNode | null {
  if (pane === target || !layoutHasTile(layout, pane) || !layoutHasTile(layout, target)) {
    return layout;
  }
  const removed = removeTile(layout, pane).layout;
  return splitTile(removed, target, pane, side, 0.5);
}

export function setSplitSizes(
  layout: LayoutNode | null,
  path: readonly number[],
  sizes: readonly number[],
): LayoutNode | null {
  if (layout === null) return layout;
  const node = nodeAt(layout, path);
  if (node?.type !== "split" || node.children.length !== sizes.length) return layout;
  if (sizes.some((size) => !Number.isFinite(size) || size <= 0)) return layout;
  return replaceAt(layout, path, (split) =>
    split.type === "split" ? { ...split, sizes: normalizeSizes(sizes) } : split,
  );
}

/** Even shares for two neighbors, except that the chat keeps the default lion's share. */
export function resetDividerSizes(
  layout: LayoutNode | null,
  path: readonly number[],
  index: number,
): LayoutNode | null {
  if (layout === null) return layout;
  const node = nodeAt(layout, path);
  if (node?.type !== "split") return layout;
  const left = node.children[index];
  const right = node.children[index + 1];
  if (!left || !right) return layout;
  const total = (node.sizes[index] ?? 0) + (node.sizes[index + 1] ?? 0);
  const leftShare =
    left.type === "chat"
      ? 1 - DEFAULT_PANE_RATIO
      : right.type === "chat"
        ? DEFAULT_PANE_RATIO
        : 0.5;
  const sizes = [...node.sizes];
  sizes[index] = total * leftShare;
  sizes[index + 1] = total * (1 - leftShare);
  return setSplitSizes(layout, path, sizes);
}

export function computeTileRects(layout: LayoutNode | null): Map<TileId, TileRect> {
  const rects = new Map<TileId, TileRect>();
  const visit = (node: LayoutNode, rect: TileRect) => {
    const id = leafId(node);
    if (id !== null) {
      rects.set(id, rect);
      return;
    }
    if (node.type !== "split") return;
    let offset = 0;
    for (const [index, child] of node.children.entries()) {
      const size = node.sizes[index] ?? 0;
      visit(
        child,
        node.direction === "row"
          ? {
              x: rect.x + rect.width * offset,
              y: rect.y,
              width: rect.width * size,
              height: rect.height,
            }
          : {
              x: rect.x,
              y: rect.y + rect.height * offset,
              width: rect.width,
              height: rect.height * size,
            },
      );
      offset += size;
    }
  };
  visit(layout ?? CHAT_LEAF, { x: 0, y: 0, width: 1, height: 1 });
  return rects;
}

export function computeDividers(layout: LayoutNode | null): LayoutDivider[] {
  const dividers: LayoutDivider[] = [];
  const visit = (node: LayoutNode, rect: TileRect, path: number[]) => {
    if (node.type !== "split") return;
    let offset = 0;
    for (const [index, child] of node.children.entries()) {
      const size = node.sizes[index] ?? 0;
      const childRect =
        node.direction === "row"
          ? {
              x: rect.x + rect.width * offset,
              y: rect.y,
              width: rect.width * size,
              height: rect.height,
            }
          : {
              x: rect.x,
              y: rect.y + rect.height * offset,
              width: rect.width,
              height: rect.height * size,
            };
      visit(child, childRect, [...path, index]);
      offset += size;
      if (index < node.children.length - 1) {
        dividers.push({
          path,
          index,
          direction: node.direction,
          splitRect: rect,
          rect:
            node.direction === "row"
              ? { x: rect.x + rect.width * offset, y: rect.y, width: 0, height: rect.height }
              : { x: rect.x, y: rect.y + rect.height * offset, width: rect.width, height: 0 },
        });
      }
    }
  };
  visit(layout ?? CHAT_LEAF, { x: 0, y: 0, width: 1, height: 1 }, []);
  return dividers;
}

/** Rebuilds a saved tree, or null when it is not a valid tree with one chat leaf. */
export function decodeLayout(raw: unknown): LayoutNode | null {
  const seen = new Set<TileId>();
  const decode = (value: unknown): LayoutNode | null => {
    if (!value || typeof value !== "object") return null;
    const node = value as Record<string, unknown>;
    if (node.type === "chat" || (node.type === "pane" && isPaneKind(node.pane))) {
      const id: TileId = node.type === "chat" ? "chat" : (node.pane as PaneKind);
      if (seen.has(id)) return null;
      seen.add(id);
      return id === "chat" ? CHAT_LEAF : { type: "pane", pane: id };
    }
    if (
      node.type !== "split" ||
      (node.direction !== "row" && node.direction !== "column") ||
      !Array.isArray(node.children) ||
      !Array.isArray(node.sizes) ||
      node.children.length < 2 ||
      node.children.length !== node.sizes.length
    ) {
      return null;
    }
    const children = node.children.map(decode);
    const sizes = node.sizes.map((size) =>
      typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 0,
    );
    if (children.some((child) => child === null) || sizes.some((size) => size === 0)) return null;
    return { type: "split", direction: node.direction, children: children as LayoutNode[], sizes };
  };
  const decoded = decode(raw);
  if (decoded === null || !seen.has("chat")) return null;
  const simplified = simplify(decoded);
  return simplified.type === "chat" ? null : simplified;
}

/** The tile whose header meets the window's top-right corner, where the title bar controls sit. */
export function cornerTile(layout: LayoutNode | null, corner: "top-left" | "top-right"): TileId {
  let node = layout ?? CHAT_LEAF;
  while (node.type === "split") {
    node =
      node.direction === "column" || corner === "top-left"
        ? node.children[0]!
        : node.children.at(-1)!;
  }
  return leafId(node)!;
}

/** Tiles whose top edge is the layout's top edge; their headers share the title bar row. */
export function topRowTiles(layout: LayoutNode | null): Set<TileId> {
  const tiles = new Set<TileId>();
  for (const [id, rect] of computeTileRects(layout)) if (rect.y < 1e-6) tiles.add(id);
  return tiles;
}

/** Tiles directly right of the chat, which push the docked thread details to a popover. */
export function hasPaneRightOfChat(layout: LayoutNode | null): boolean {
  const rects = computeTileRects(layout);
  const chat = rects.get("chat");
  if (!chat) return false;
  return chat.x + chat.width < 1 - 1e-6;
}
