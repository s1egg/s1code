import type { ScopedThreadRef } from "@s1tools/contracts";
import { useGT, useMessages } from "gt-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useTheme } from "~/hooks/useTheme";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { workspaceAreaProps } from "~/lib/workspaceFocus";
import {
  computeDividers,
  computeTileRects,
  cornerTile,
  dividerMinimums,
  layoutPanes,
  minNodeSize,
  PANE_KINDS,
  setSplitSizes,
  topRowTiles,
  type LayoutDivider,
  type LayoutNode,
  type PaneKind,
  type PaneSide,
  type TileId,
  type TileRect,
} from "~/paneLayout";
import {
  paneKindOf,
  paneSurface,
  useRightPanelStore,
  type RightPanelSurface,
  type ThreadRightPanelState,
} from "~/rightPanelStore";

import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { dispatchPreviewAction } from "../preview/previewActionBus";
import { preventThumbButtonFocus, takeThumbButtonNavigation } from "../preview/thumbButtons";
import { FloatingPaneHeader, PaneHeader, type PaneHeaderContext } from "./PaneHeader";
import { usePaneDragStore } from "./paneDragStore";
import { SurfaceIcon, previewFaviconOf, surfaceTitle } from "./paneSurfacePresentation";

/** A pane is pulled out of the layout only after the pointer travels this far. */
const DRAG_THRESHOLD_PX = 4;
/** A minimized pane's window, anchored to the chat's bottom-right corner above the composer. */
const FLOATING_WIDTH_PX = 340;
const FLOATING_HEIGHT_PX = 210;
const FLOATING_EDGE_GAP_PX = 12;
const FLOATING_STACK_GAP_PX = 8;
/** Room left free at the chat's top for its header. */
const FLOATING_TOP_CLEARANCE_PX = 48;
const FLOATING_OVERFLOW_HEIGHT_PX = 28;

/**
 * How many floating windows stack in a chat tile `chatHeight` tall above `inset`. When they do
 * not all fit, the ones above fold into a picker that needs its own row.
 */
function floatingWindowsThatFit(chatHeight: number, inset: number, count: number): number {
  const room = chatHeight - inset - FLOATING_EDGE_GAP_PX - FLOATING_TOP_CLEARANCE_PX;
  const slot = FLOATING_HEIGHT_PX + FLOATING_STACK_GAP_PX;
  if (count * slot - FLOATING_STACK_GAP_PX <= room) return count;
  return Math.max(0, Math.floor((room - FLOATING_OVERFLOW_HEIGHT_PX) / slot));
}

export interface PaneDropTarget {
  readonly tile: TileId;
  readonly side: PaneSide;
}

/** The half of a tile nearest the pointer, as fractions of the tile. */
function dropSideAt(x: number, y: number): PaneSide {
  const distances: Array<[PaneSide, number]> = [
    ["left", x],
    ["right", 1 - x],
    ["top", y],
    ["bottom", 1 - y],
  ];
  return distances.reduce((nearest, entry) => (entry[1] < nearest[1] ? entry : nearest))[0];
}

function zoneRect(rect: TileRect, side: PaneSide): TileRect {
  switch (side) {
    case "left":
      return { ...rect, width: rect.width / 2 };
    case "right":
      return { ...rect, x: rect.x + rect.width / 2, width: rect.width / 2 };
    case "top":
      return { ...rect, height: rect.height / 2 };
    case "bottom":
      return { ...rect, y: rect.y + rect.height / 2, height: rect.height / 2 };
  }
}

const percent = (value: number) => `${value * 100}%`;

function tileStyle(rect: TileRect): CSSProperties {
  return {
    left: percent(rect.x),
    top: percent(rect.y),
    width: percent(rect.width),
    height: percent(rect.height),
  };
}

const dividerKey = (divider: Pick<LayoutDivider, "path" | "index">) =>
  `${divider.path.join(".")}:${divider.index}`;

const FULL_RECT: TileRect = { x: 0, y: 0, width: 1, height: 1 };

/**
 * The `index`th floating window from the bottom, kept inside the chat column's corner: above
 * `inset` and left of `endInset`, the docked thread details.
 */
function floatingStyle(
  chat: TileRect,
  index: number,
  inset: number,
  endInset: string,
  height = FLOATING_HEIGHT_PX,
): CSSProperties {
  const chatBottom = percent(1 - chat.y - chat.height);
  const stacked = `calc(${chatBottom} + ${
    inset + FLOATING_EDGE_GAP_PX + index * (FLOATING_HEIGHT_PX + FLOATING_STACK_GAP_PX)
  }px)`;
  // Never above the chat's header, nor below its bottom edge, however tall the stack's inset.
  const highest = `calc(${percent(1 - chat.y)} - ${FLOATING_TOP_CLEARANCE_PX + height}px)`;
  return {
    left: "auto",
    top: "auto",
    right: `calc(${percent(1 - chat.x - chat.width)} + ${endInset} + ${FLOATING_EDGE_GAP_PX}px)`,
    bottom: `max(calc(${chatBottom} + ${FLOATING_EDGE_GAP_PX}px), min(${stacked}, ${highest}))`,
    width: `min(${FLOATING_WIDTH_PX}px, calc(${percent(chat.width)} - ${endInset} - ${FLOATING_EDGE_GAP_PX * 2}px))`,
    height: `${height}px`,
  };
}

/**
 * The thread's content area: the chat and its panes tiled by the layout tree. Every tile is a
 * sibling positioned from the tree, so rearranging only restyles tiles and never remounts the
 * chat, a terminal or a page. Tiles keep a fixed DOM order for the same reason: moving an
 * iframe's element reloads it.
 */
export function PaneWorkspace(props: {
  readonly threadRef: ScopedThreadRef;
  readonly panelState: ThreadRightPanelState;
  readonly chat: ReactNode;
  /** The title bar icons; the chat's header keeps them unless a pane fills the window. */
  readonly titlebarControls: ReactNode;
  readonly header: PaneHeaderContext;
  /** Minimized panes drawn here as small windows, bottom one first. */
  readonly floating: readonly PaneKind[];
  /** Room the composer, or a preview floating under the windows, takes at the chat's bottom. */
  readonly floatingInset: number;
  /** Room docked thread details take at the chat's right edge, as a CSS length. */
  readonly floatingEndInset: string;
  readonly onRestoreFloating: (pane: PaneKind) => void;
  /** Hands keyboard focus back to the chat, as Escape in a floating window does. */
  readonly onReleaseFocus: () => void;
  readonly renderContent: (surface: RightPanelSurface, visible: boolean) => ReactNode;
}) {
  const gt = useGT();
  const messages = useMessages();
  const { threadRef, panelState, header } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileElements = useRef(new Map<TileId, HTMLElement>());
  const dividerElements = useRef(new Map<string, HTMLElement>());
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const { resolvedTheme } = useTheme();
  const [drag, setDrag] = useState<{
    pane: PaneKind;
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<PaneDropTarget | null>(null);
  const bumpLayoutRevision = usePaneDragStore((state) => state.bumpLayoutRevision);

  const layout: LayoutNode | null = panelState.isOpen ? panelState.layout : null;
  const panes = layoutPanes(layout);
  const fill =
    panelState.fill !== undefined && panes.includes(panelState.fill) ? panelState.fill : null;
  const rects = computeTileRects(layout);
  const dividers = fill === null ? computeDividers(layout) : [];
  const topRow = fill === null ? topRowTiles(layout) : new Set<TileId>([fill]);
  const topRight = fill ?? cornerTile(layout, "top-right");
  const topLeft = fill ?? cornerTile(layout, "top-left");
  const floating = fill === null ? props.floating : [];
  const chatRect = rects.get("chat") ?? FULL_RECT;
  const [floatingFit, setFloatingFit] = useState(Number.POSITIVE_INFINITY);
  const shownFloating = floating.slice(0, floatingFit);
  const foldedFloating = floating.slice(shownFloating.length);
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- counts the floating windows the chat tile has room for as the workspace resizes
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || floating.length === 0) return;
    const count = floating.length;
    const fit = () =>
      setFloatingFit(
        floatingWindowsThatFit(
          container.getBoundingClientRect().height * chatRect.height,
          props.floatingInset,
          count,
        ),
      );
    fit();
    return observeResize(container, fit);
  }, [chatRect.height, floating.length, props.floatingInset]);
  const focusedPane = (() => {
    const active = panelState.surfaces.find((surface) => surface.id === panelState.activeSurfaceId);
    return active ? paneKindOf(active.kind) : null;
  })();
  const renderedPanes = PANE_KINDS.filter((pane) =>
    fill === null ? panes.includes(pane) || floating.includes(pane) : pane === fill,
  );
  const layoutKey = JSON.stringify([
    layout,
    fill,
    shownFloating,
    props.floatingInset,
    props.floatingEndInset,
  ]);
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- a tile can move without resizing; desktop browser views are placed again from the committed layout
  useLayoutEffect(() => {
    bumpLayoutRevision();
  }, [
    bumpLayoutRevision,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the layout itself is what changed
    layoutKey,
  ]);

  const applyLayoutStyles = (next: LayoutNode | null) => {
    for (const [id, rect] of computeTileRects(next)) {
      const element = tileElements.current.get(id);
      if (element) Object.assign(element.style, tileStyle(rect));
    }
    for (const divider of computeDividers(next)) {
      const element = dividerElements.current.get(dividerKey(divider));
      if (element) Object.assign(element.style, dividerStyle(divider));
    }
    bumpLayoutRevision();
  };

  const startDividerDrag = (event: ReactPointerEvent<HTMLDivElement>, divider: LayoutDivider) => {
    const container = containerRef.current;
    if (event.button !== 0 || !container || layout === null) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const bounds = container.getBoundingClientRect();
    const horizontal = divider.direction === "row";
    const splitStart = horizontal
      ? bounds.left + divider.splitRect.x * bounds.width
      : bounds.top + divider.splitRect.y * bounds.height;
    const splitLength = horizontal
      ? divider.splitRect.width * bounds.width
      : divider.splitRect.height * bounds.height;
    let split: LayoutNode = layout;
    for (const index of divider.path)
      split = split.type === "split" ? split.children[index]! : split;
    if (split.type !== "split" || splitLength <= 0) return;
    const startSizes = split.sizes;
    const before = startSizes.slice(0, divider.index).reduce((sum, size) => sum + size, 0);
    const pair = startSizes[divider.index]! + startSizes[divider.index + 1]!;
    // Docked thread details sit inside the chat tile, so the chat's own minimum excludes them.
    const docked = horizontal
      ? (tileElements.current
          .get("chat")
          ?.querySelector('[data-thread-details-panel="docked"]')
          ?.getBoundingClientRect().width ?? 0)
      : 0;
    const minFor = (child: LayoutNode) =>
      minNodeSize(child, horizontal ? "width" : "height", docked) / splitLength;
    const [minLeft, minRight] = dividerMinimums(
      minFor(split.children[divider.index]!),
      minFor(split.children[divider.index + 1]!),
      pair,
    );
    let sizes = startSizes;
    const move = (moveEvent: PointerEvent) => {
      const position = horizontal ? moveEvent.clientX : moveEvent.clientY;
      const boundary = (position - splitStart) / splitLength;
      const left = Math.min(pair - minRight, Math.max(minLeft, boundary - before));
      sizes = startSizes.map((size, index) =>
        index === divider.index ? left : index === divider.index + 1 ? pair - left : size,
      );
      applyLayoutStyles(setSplitSizes(layout, divider.path, sizes));
    };
    const end = (endEvent: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      if (handle.hasPointerCapture(endEvent.pointerId))
        handle.releasePointerCapture(endEvent.pointerId);
      if (endEvent.type === "pointercancel" || sizes === startSizes) {
        applyLayoutStyles(layout);
        return;
      }
      useRightPanelStore.getState().resizeSplit(threadRef, divider.path, sizes);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const startPaneDrag = (event: ReactPointerEvent<HTMLElement>, pane: PaneKind, title: string) => {
    if (event.button !== 0 || fill !== null) return;
    const chip = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let target: PaneDropTarget | null = null;
    let tiles: Array<{ id: TileId; rect: DOMRect }> = [];
    const placeGhost = (x: number, y: number) => {
      const ghost = ghostRef.current;
      if (ghost) ghost.style.transform = `translate(${x + 12}px, ${y + 14}px)`;
    };
    const finish = (commit: boolean) => {
      chip.removeEventListener("pointermove", move);
      chip.removeEventListener("pointerup", up);
      chip.removeEventListener("pointercancel", cancel);
      chip.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("keydown", keydown, true);
      if (chip.hasPointerCapture(pointerId)) chip.releasePointerCapture(pointerId);
      if (!dragging) return;
      // The click that ends a drag is not a click on the chip.
      chip.addEventListener("click", (click) => click.stopPropagation(), {
        capture: true,
        once: true,
      });
      setDrag(null);
      setDropTarget(null);
      usePaneDragStore.getState().setDragging(null);
      if (commit && target) {
        useRightPanelStore.getState().movePane(threadRef, pane, target.tile, target.side);
      }
    };
    const move = (moveEvent: PointerEvent) => {
      if (!dragging) {
        if (
          Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD_PX
        ) {
          return;
        }
        dragging = true;
        tiles = [...tileElements.current].flatMap(([id, element]) =>
          id === pane || (id !== "chat" && floating.includes(id))
            ? []
            : [{ id, rect: element.getBoundingClientRect() }],
        );
        setDrag({ pane, title, x: moveEvent.clientX, y: moveEvent.clientY });
        usePaneDragStore.getState().setDragging(pane);
      }
      placeGhost(moveEvent.clientX, moveEvent.clientY);
      const hit = tiles.find(
        ({ rect }) =>
          moveEvent.clientX >= rect.left &&
          moveEvent.clientX <= rect.right &&
          moveEvent.clientY >= rect.top &&
          moveEvent.clientY <= rect.bottom,
      );
      const next = hit
        ? {
            tile: hit.id,
            side: dropSideAt(
              (moveEvent.clientX - hit.rect.left) / hit.rect.width,
              (moveEvent.clientY - hit.rect.top) / hit.rect.height,
            ),
          }
        : null;
      if (next?.tile !== target?.tile || next?.side !== target?.side) {
        target = next;
        setDropTarget(next);
      }
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const keydown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== "Escape" || !dragging) return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      finish(false);
    };
    // Captured from the start, so a page or terminal under the pointer cannot swallow the moves.
    chip.setPointerCapture(pointerId);
    chip.addEventListener("pointermove", move);
    chip.addEventListener("pointerup", up);
    chip.addEventListener("pointercancel", cancel);
    chip.addEventListener("lostpointercapture", cancel);
    window.addEventListener("keydown", keydown, true);
  };

  const dropZone = (() => {
    if (!drag || !dropTarget) return null;
    const rect = rects.get(dropTarget.tile);
    return rect ? zoneRect(rect, dropTarget.side) : null;
  })();
  const dragSurface = drag ? paneSurface(panelState, drag.pane) : null;
  const dragFavicon = dragSurface
    ? previewFaviconOf(dragSurface, header.previewSessions, header.desktopByTabId)
    : null;

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      data-pane-workspace
      data-pane-dragging={drag ? drag.pane : undefined}
    >
      <div
        key="chat"
        ref={(element) => {
          if (!element) return;
          tileElements.current.set("chat", element);
          return () => {
            tileElements.current.delete("chat");
          };
        }}
        data-pane-tile="chat"
        className={cn(
          "absolute flex min-h-0 min-w-0 flex-col overflow-hidden",
          fill !== null && "invisible",
        )}
        style={tileStyle(fill === null ? (rects.get("chat") ?? FULL_RECT) : FULL_RECT)}
        inert={fill !== null}
      >
        {props.chat}
      </div>
      {renderedPanes.map((pane) => {
        const surface = paneSurface(panelState, pane);
        if (!surface) return null;
        const floatingIndex = floating.indexOf(pane);
        const rect = fill === pane ? FULL_RECT : (rects.get(pane) ?? FULL_RECT);
        const items = panelState.surfaces.filter((entry) => paneKindOf(entry.kind) === pane);
        const label = surfaceTitle(surface, header.previewSessions, messages);
        const focusThisPane = () => {
          if (focusedPane !== pane) useRightPanelStore.getState().focusPane(threadRef, pane);
        };
        return (
          <section
            key={pane}
            ref={(element) => {
              if (!element) return;
              tileElements.current.set(pane, element);
              // Content rendered through a portal owned elsewhere, like the terminal's views, sits
              // in this tile's DOM but not its React tree, so only native events see it.
              const focusFromDom = () => {
                if (element.dataset.paneFocused !== "true") {
                  useRightPanelStore.getState().focusPane(threadRef, pane);
                }
              };
              element.addEventListener("focusin", focusFromDom);
              element.addEventListener("pointerdown", focusFromDom, true);
              return () => {
                tileElements.current.delete(pane);
                element.removeEventListener("focusin", focusFromDom);
                element.removeEventListener("pointerdown", focusFromDom, true);
              };
            }}
            {...workspaceAreaProps("panel", 4, gt("Workspace panel: {title}", { title: label }))}
            data-pane-tile={floatingIndex < 0 ? pane : undefined}
            data-pane-floating={floatingIndex < 0 ? undefined : pane}
            hidden={foldedFloating.includes(pane)}
            data-pane-surface
            data-pane-focused={focusedPane === pane ? "true" : undefined}
            data-workspace-focus-key={`panel:${header.environmentId}:${surface.id}`}
            className={cn(
              "absolute flex min-h-0 min-w-0 flex-col overflow-hidden bg-background surface-glow",
              floatingIndex >= 0
                ? "z-30 rounded-xl shadow-lg/20 ring-1 ring-border"
                : [
                    rect.x > 1e-6 && "border-l border-border",
                    rect.y > 1e-6 && "border-t border-border",
                  ],
            )}
            style={
              floatingIndex < 0
                ? tileStyle(rect)
                : floatingStyle(
                    chatRect,
                    floatingIndex,
                    props.floatingInset,
                    props.floatingEndInset,
                  )
            }
            // Keyboard focus arriving by Tab or F6 makes this the pane that pane commands act on.
            onFocusCapture={focusThisPane}
            onPointerDownCapture={focusThisPane}
            onKeyDown={(event) => {
              if (floatingIndex < 0 || event.key !== "Escape" || event.defaultPrevented) return;
              if (
                event.target instanceof HTMLElement &&
                event.target.closest("input, textarea, [contenteditable='true']")
              )
                return;
              event.preventDefault();
              props.onReleaseFocus();
            }}
            onMouseDown={preventThumbButtonFocus}
            onMouseUp={(event) =>
              takeThumbButtonNavigation(
                event,
                pane === "browser" ? dispatchPreviewAction : undefined,
              )
            }
          >
            {floatingIndex >= 0 ? (
              <FloatingPaneHeader
                pane={pane}
                surface={surface}
                context={header}
                onRestore={() => props.onRestoreFloating(pane)}
              />
            ) : (
              <PaneHeader
                pane={pane}
                surface={surface}
                items={items}
                context={header}
                focused={focusedPane === pane}
                filled={fill === pane}
                topRow={topRow.has(pane)}
                topLeft={topLeft === pane}
                topRight={topRight === pane}
                trailing={fill === pane ? props.titlebarControls : null}
                onChipPointerDown={(event, title) => startPaneDrag(event, pane, title)}
                onMove={(side) =>
                  useRightPanelStore.getState().movePane(threadRef, pane, "chat", side)
                }
                onToggleFill={() =>
                  useRightPanelStore.getState().setFill(threadRef, fill === pane ? null : pane)
                }
              />
            )}
            <div className="flex min-h-0 flex-1 flex-col" data-right-panel-surface-content>
              {props.renderContent(surface, true)}
            </div>
          </section>
        );
      })}
      {foldedFloating.length > 0 ? (
        <div
          className="pointer-events-none absolute z-30 flex items-end justify-end"
          style={floatingStyle(
            chatRect,
            shownFloating.length,
            props.floatingInset,
            props.floatingEndInset,
            FLOATING_OVERFLOW_HEIGHT_PX,
          )}
          data-pane-floating-overflow
        >
          <div className="pointer-events-auto">
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    aria-label={gt(
                      "{count, plural, one {{count} more minimized pane} other {{count} more minimized panes}}",
                      { count: foldedFloating.length },
                    )}
                    size="xs"
                    variant="outline"
                  />
                }
              >
                +{foldedFloating.length}
              </MenuTrigger>
              <MenuPopup align="end" side="top" sideOffset={6} className="min-w-44">
                {foldedFloating.map((pane) => {
                  const surface = paneSurface(panelState, pane);
                  return surface ? (
                    <MenuItem key={pane} onClick={() => props.onRestoreFloating(pane)}>
                      {surfaceTitle(surface, header.previewSessions, messages)}
                    </MenuItem>
                  ) : null;
                })}
              </MenuPopup>
            </Menu>
          </div>
        </div>
      ) : null}
      {dividers.map((divider) => (
        <div
          key={dividerKey(divider)}
          ref={(element) => {
            if (!element) return;
            const key = dividerKey(divider);
            dividerElements.current.set(key, element);
            return () => {
              dividerElements.current.delete(key);
            };
          }}
          role="separator"
          aria-orientation={divider.direction === "row" ? "vertical" : "horizontal"}
          aria-label={gt("Resize panes")}
          data-pane-divider={dividerKey(divider)}
          className={cn(
            "absolute z-20 touch-none bg-transparent hover:bg-ring/40",
            divider.direction === "row" ? "cursor-col-resize" : "cursor-row-resize",
          )}
          style={dividerStyle(divider)}
          onPointerDown={(event) => startDividerDrag(event, divider)}
          onDoubleClick={() =>
            useRightPanelStore.getState().resetDivider(threadRef, divider.path, divider.index)
          }
        />
      ))}
      {drag ? (
        <div className="pointer-events-none absolute inset-0 z-40" data-pane-drop-layer>
          {dropZone ? (
            <div
              className="absolute p-1"
              style={tileStyle(dropZone)}
              data-pane-drop-zone={`${dropTarget?.tile}:${dropTarget?.side}`}
            >
              <div className="flex size-full items-center justify-center rounded-lg border-2 border-ring bg-ring/8">
                <span className="rounded-full bg-ring px-2.5 py-0.5 font-medium text-white text-xs shadow-sm">
                  {gt("Move here")}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {drag && dragSurface ? (
        <div
          ref={ghostRef}
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 z-50 flex h-7 max-w-52 items-center gap-1.5 rounded-lg bg-background px-2 text-foreground text-sm shadow-md ring-1 ring-border"
          style={{ transform: `translate(${drag.x + 12}px, ${drag.y + 14}px)` }}
          data-pane-drag-ghost
        >
          <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
            <SurfaceIcon
              surface={dragSurface}
              previewUrl={dragFavicon?.url ?? null}
              previewCapturedUrl={dragFavicon?.capturedUrl ?? null}
              theme={resolvedTheme}
              environmentId={header.environmentId}
            />
          </span>
          <span className="truncate">{drag.title}</span>
        </div>
      ) : null}
    </div>
  );
}

/** A thin hit area centred on the boundary; the visible line is the tiles' own border. */
function dividerStyle(divider: Pick<LayoutDivider, "direction" | "rect">): CSSProperties {
  return divider.direction === "row"
    ? {
        left: `calc(${percent(divider.rect.x)} - 3px)`,
        top: percent(divider.rect.y),
        width: "6px",
        height: percent(divider.rect.height),
      }
    : {
        left: percent(divider.rect.x),
        top: `calc(${percent(divider.rect.y)} - 3px)`,
        width: percent(divider.rect.width),
        height: "6px",
      };
}
