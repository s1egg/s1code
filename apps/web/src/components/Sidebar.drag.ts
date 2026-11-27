import { closestCenter, type CollisionDetection, type Modifier } from "@dnd-kit/core";
import { verticalListSortingStrategy, type SortingStrategy } from "@dnd-kit/sortable";
import {
  resolveSidebarDropTarget,
  sidebarListItemId,
  sidebarMarkerId,
  type SidebarListItem,
  type SidebarListMarker,
  type SidebarSection,
} from "./Sidebar.logic";

const stationary = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
const hidden = { ...stationary, scaleY: 0 };
type ThreadItem = Extract<SidebarListItem, { kind: "thread" }>;
type Layout = Parameters<SortingStrategy>[0];
const isGroupHeader = (item: SidebarListItem | undefined) =>
  item?.kind === "marker" &&
  (item.marker === "working-header" ||
    item.marker === "review-header" ||
    item.marker === "snoozed-header" ||
    item.marker === "settled-header");
// Drag boundaries are zero-height markers that show their label only while dragging; with
// threads under them they are the group label instead.
const isBoundary = (item: SidebarListItem) =>
  item.kind === "marker" && (item.marker === "pinned-header" || item.marker === "pinned-divider");

export function restrictBelowSidebarLabel(
  { transform, containerNodeRect, draggingNodeRect }: Parameters<Modifier>[0],
  offset: number,
) {
  if (!containerNodeRect || !draggingNodeRect) return transform;
  const minimumY = containerNodeRect.top + offset - draggingNodeRect.top;
  return transform.y < minimumY ? { ...transform, y: minimumY } : transform;
}

export function createSidebarCollisionDetection(
  isValidTarget: (id: string) => boolean,
  options: {
    items?: readonly SidebarListItem[];
    activationY?: number | null;
  } = {},
): CollisionDetection {
  const validity = new Map<string, boolean>();
  const sections = new Map<string, SidebarSection | null>();
  let previousPointerY = options.activationY;
  let boundarySection: "pinned" | "active" | undefined;
  return (args) => {
    let collisions = closestCenter(args);
    const pointer = args.pointerCoordinates;
    const items = options.items;
    const source = items?.find((item) => item.kind === "thread" && item.key === args.active.id);
    // The Pinned drop area ends at the first group label below it; Working and To review sit
    // between it and Earlier.
    const pinnedEnd = (["working-header", "review-header", "pinned-divider"] as const)
      .map((marker) =>
        args.droppableContainers.find((container) => container.id === sidebarMarkerId(marker)),
      )
      .find((container) => container !== undefined)?.node.current;
    const boundary = (
      pinnedEnd?.querySelector(".sidebar-drag-boundary-label") ?? pinnedEnd
    )?.getBoundingClientRect();
    if (items && boundary && source?.kind === "thread" && pointer) {
      boundarySection ??= source.section === "pinned" ? "pinned" : "active";
      // Only pointer movement changes sections; opening the destination moves rows under stationary gestures.
      const previousY = previousPointerY ?? pointer.y;
      previousPointerY = pointer.y;
      if (pointer.x >= boundary.left && pointer.x <= boundary.right) {
        if (pointer.y < previousY && pointer.y <= boundary.bottom) boundarySection = "pinned";
        else if (pointer.y > previousY && pointer.y >= boundary.top) boundarySection = "active";
        const nextHeader = (["snoozed-header", "settled-header"] as const)
          .map((marker) =>
            args.droppableContainers.find((container) => container.id === sidebarMarkerId(marker)),
          )
          .find((container) => container !== undefined);
        const activeBottom = nextHeader?.node.current?.getBoundingClientRect().top;
        if (boundarySection === "pinned" || (activeBottom != null && pointer.y < activeBottom)) {
          const target = collisions.find((collision) => {
            const id = String(collision.id);
            if (!sections.has(id)) {
              sections.set(
                id,
                resolveSidebarDropTarget(items, String(args.active.id), id)?.section ?? null,
              );
            }
            return sections.get(id) === boundarySection;
          });
          if (target)
            collisions = [target, ...collisions.filter((collision) => collision !== target)];
        }
      }
    }
    const nearest = collisions[0];
    if (!nearest || nearest.id === args.active.id) {
      return collisions;
    }
    const id = String(nearest.id);
    const valid = validity.get(id) ?? isValidTarget(id);
    validity.set(id, valid);
    return valid ? collisions : collisions.filter((collision) => collision.id === args.active.id);
  };
}

/** The group a drop lists the thread in; its label is the one the drag highlights. */
export function resolveSidebarDropDestination(
  targetSection: SidebarSection | null,
  activeLanding: "working" | "review" | "active" | undefined,
): SidebarSection | null {
  return targetSection === "active" ? (activeLanding ?? "active") : targetSection;
}

export function createSidebarSortingStrategy(input: {
  items: readonly SidebarListItem[];
  enabled?: boolean;
  settledOrder: readonly string[];
  /** The order of the group a drop into the active section lists the thread in. */
  activeOrder?: readonly string[];
  /** Where a drop into the active section lists the thread: Working, To review or Earlier. */
  activeLanding?: "working" | "review" | "active";
  settledExpanded: boolean;
  settledVisibleCount?: number;
  routeThreadKey?: string | null;
  snoozedThreadCount?: number;
  cardHeight?: number;
  slimHeight?: number;
  boundaryLabelHeight?: number;
}): SortingStrategy {
  if (input.enabled === false) return () => stationary;
  const { items } = input;
  const indices = new Map(items.map((item, index) => [sidebarListItemId(item), index]));
  let previous: Pick<Layout, "rects" | "activeIndex" | "overIndex"> | undefined;
  let transforms: ReturnType<SortingStrategy>[] | null = [];

  function project({ rects, activeIndex, overIndex }: Layout) {
    const active = items[activeIndex];
    const over = items[overIndex] ?? active;
    if (active?.kind !== "thread" || !over || !rects[0]) return [];
    const target = resolveSidebarDropTarget(items, active.key, sidebarListItemId(over));
    if (!target) return [];
    const groups: Record<SidebarSection, ThreadItem[]> = {
      pinned: [],
      working: [],
      review: [],
      active: [],
      snoozed: [],
      settled: [],
    };
    let cardHeight = input.cardHeight;
    let slimHeight = input.slimHeight;
    let headerScale: number | undefined;
    for (const [index, item] of items.entries()) {
      if (item.kind === "marker") {
        if (isGroupHeader(item)) {
          const height = rects[index]?.height;
          if (height) headerScale ??= height / 36;
        }
        continue;
      }
      if (item.section === "working") cardHeight ??= rects[index]?.height;
      else slimHeight ??= rects[index]?.height;
      if (item.key !== active.key) groups[item.section].push(item);
    }
    const scale =
      slimHeight !== undefined ? slimHeight / 32 : (headerScale ?? (cardHeight ?? 52) / 52);
    cardHeight ??= 52 * scale;
    slimHeight ??= 32 * scale;
    const labelHeight = (input.boundaryLabelHeight ?? 0) * scale;
    const landing =
      resolveSidebarDropDestination(target.section, input.activeLanding) ?? target.section;
    const group = groups[landing];
    const order =
      target.section === "pinned"
        ? target.pinnedOrder
        : target.section === "settled"
          ? input.settledOrder
          : (input.activeOrder ?? target.activeOrder);
    const ranks = new Map(order.map((key, index) => [key, index]));
    const rank = ranks.get(active.key) ?? Number.POSITIVE_INFINITY;
    const index = group.findIndex(
      (item) => (ranks.get(item.key) ?? Number.POSITIVE_INFINITY) > rank,
    );
    group.splice(index < 0 ? group.length : index, 0, { ...active, section: landing });
    const settledOrder = (
      input.settledOrder.length > 0 ? input.settledOrder : groups.settled.map((item) => item.key)
    ).filter((key) => key !== active.key || target.section === "settled");
    const visible = input.settledExpanded
      ? settledOrder.slice(0, input.settledVisibleCount ?? settledOrder.length)
      : [];
    const routeKey = input.routeThreadKey;
    if (routeKey && settledOrder.includes(routeKey) && !visible.includes(routeKey)) {
      visible.push(routeKey);
    }
    groups.settled = visible.map((key) => ({ kind: "thread", key, section: "settled" }));
    const projected: SidebarListItem[] = [];
    const marker = (name: SidebarListMarker) => projected.push({ kind: "marker", marker: name });
    const hasMarker = (name: SidebarListMarker) =>
      items.some((item) => item.kind === "marker" && item.marker === name);
    marker("pinned-header");
    projected.push(...groups.pinned);
    if (groups.working.length > 0) {
      marker("working-header");
      projected.push(...groups.working);
    }
    if (groups.review.length > 0 || (hasMarker("review-header") && active.section !== "review")) {
      marker("review-header");
      projected.push(...groups.review);
    }
    marker("pinned-divider");
    if (groups.active.length > 0) projected.push(...groups.active);
    else marker("active-placeholder");
    if (
      groups.snoozed.length > 0 ||
      ((active.section !== "snoozed" || (input.snoozedThreadCount ?? 0) > 1) &&
        hasMarker("snoozed-header"))
    ) {
      marker("snoozed-header");
      projected.push(...groups.snoozed);
    }
    marker("settled-header");
    if (groups.settled.length > 0) projected.push(...groups.settled);
    else marker("settled-placeholder");
    const heights = projected.map((item) => {
      const index = indices.get(sidebarListItemId(item));
      const rect = index === undefined ? undefined : rects[index];
      const fallback =
        item.kind === "thread" && item.section === "working" ? cardHeight : slimHeight;
      const moved = item.kind === "thread" && item.key === active.key;
      if (isBoundary(item)) return rect && rect.height > 0 ? rect.height : labelHeight;
      if (item.kind === "marker" && item.marker.endsWith("placeholder")) return slimHeight;
      return moved ? fallback : (rect?.height ?? fallback);
    });
    const result = items.map(() => hidden);
    let top = rects[0].top;
    for (const [projectedIndex, item] of projected.entries()) {
      const index = indices.get(sidebarListItemId(item));
      const rect = index === undefined ? undefined : rects[index];
      if (index !== undefined && rect) result[index] = { ...stationary, y: top - rect.top };
      top += heights[projectedIndex]! + 1;
    }
    result[activeIndex] = stationary;
    return result;
  }

  return (args) => {
    if (
      previous?.rects !== args.rects ||
      previous.activeIndex !== args.activeIndex ||
      previous.overIndex !== args.overIndex
    ) {
      previous = args;
      transforms = project(args);
    }
    return transforms === null
      ? verticalListSortingStrategy(args)
      : (transforms[args.index] ?? stationary);
  };
}
