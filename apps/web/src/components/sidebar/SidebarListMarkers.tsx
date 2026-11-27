import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useLayoutEffect } from "react";
import { cn } from "~/lib/utils";
import {
  animateSidebarLayoutChanges,
  sidebarMarkerId,
  type SidebarListMarker,
} from "../Sidebar.logic";
import { SIDEBAR_SORTABLE_DRAG_DISABLED } from "./SidebarThreadRow";

function SortableSidebarMarker(props: {
  marker: SidebarListMarker;
  className?: string;
  children?: ReactNode;
  revealOverflow?: boolean;
  "data-testid"?: string;
}) {
  const { node, setNodeRef, transform, transition } = useSortable({
    id: sidebarMarkerId(props.marker),
    disabled: SIDEBAR_SORTABLE_DRAG_DISABLED,
    animateLayoutChanges: animateSidebarLayoutChanges,
  });
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- keeps the projected drop box inside the scroll viewport as drag transforms move it
  useLayoutEffect(() => {
    if (props.revealOverflow && transform?.y !== undefined) {
      node.current?.firstElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [node, props.revealOverflow, transform?.y]);
  return (
    <li
      ref={setNodeRef}
      data-thread-selection-safe
      data-testid={props["data-testid"]}
      className={cn("list-none", props.className)}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: props.marker.endsWith("-placeholder") ? "none" : transition,
        visibility: transform?.scaleY === 0 ? "hidden" : undefined,
      }}
    >
      {props.children}
    </li>
  );
}

export function SidebarSectionPlaceholder(props: {
  marker: "active-placeholder" | "settled-placeholder";
  label: string;
  showHint: boolean;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="relative mx-0.5 -mb-px h-0"
      // Revealing on every drag scrolls the list out from under the pointer.
      revealOverflow={
        props.marker === "settled-placeholder" && props.showHint && props.isDropTarget
      }
    >
      {props.showHint ? (
        <div
          className={cn(
            "absolute inset-x-0 top-0 flex h-9 items-center justify-center rounded-md border border-dashed border-sidebar-foreground/25 text-xs text-sidebar-foreground/80",
            props.isDropTarget && "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          {props.label}
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

function SidebarGroupLabelText(props: { label: string; count: number; tone?: string }) {
  return (
    <span
      className={cn(
        "flex h-6 items-center gap-1.5 px-2 text-xs font-medium",
        props.tone ?? "text-sidebar-muted-foreground",
      )}
    >
      <span className="min-w-0 truncate">{props.label}</span>
      <span className="rounded-full bg-sidebar-row-hover px-1.5 text-2xs leading-4 font-semibold tabular-nums text-sidebar-foreground/80">
        {props.count}
      </span>
    </span>
  );
}

/**
 * The Pinned and Earlier group labels. They are also the drag boundaries that decide
 * whether a drop pins or unpins, so an empty group keeps a zero-height marker whose label
 * shows only while dragging.
 */
export function SidebarDragBoundary(props: {
  marker: "pinned-header" | "pinned-divider";
  label: string;
  count: number;
  visible: boolean;
  isDropTarget: boolean;
}) {
  if (props.count > 0) {
    return (
      <SortableSidebarMarker
        marker={props.marker}
        data-testid={`sidebar-${props.marker}`}
        className="pointer-events-none relative flex h-9 items-end pb-0.5"
      >
        <span className="sidebar-drag-boundary-label flex w-full items-center">
          <SidebarGroupLabelText
            label={props.label}
            count={props.count}
            {...(props.isDropTarget ? { tone: "text-primary" } : {})}
          />
        </span>
      </SortableSidebarMarker>
    );
  }
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="pointer-events-none relative mx-0.5 -mb-px h-0"
    >
      {props.visible ? (
        <div className="sidebar-drag-boundary-label absolute inset-x-2 top-1 flex h-4 items-center gap-2">
          <span
            className={cn(
              "shrink-0 text-xs font-medium",
              props.isDropTarget ? "text-primary" : "text-sidebar-foreground/80",
            )}
          >
            {props.label}
          </span>
          <span
            aria-hidden
            className={cn(
              "h-px flex-1",
              props.isDropTarget ? "bg-primary/50" : "bg-sidebar-foreground/25",
            )}
          />
        </div>
      ) : null}
    </SortableSidebarMarker>
  );
}

/**
 * The Working and To review labels. Rows there follow run state, so they take no drops, but a
 * drop into Earlier lists a running or unseen thread here, and the label shows it.
 */
export function SidebarGroupLabel(props: {
  marker: "working-header" | "review-header";
  label: string;
  count: number;
  isDropTarget: boolean;
}) {
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className="pointer-events-none relative flex h-9 items-end pb-0.5"
    >
      <SidebarGroupLabelText
        label={props.label}
        count={props.count}
        {...(props.isDropTarget ? { tone: "text-primary" } : {})}
      />
    </SortableSidebarMarker>
  );
}

export function SidebarSectionHeader(props: {
  marker: "snoozed-header" | "settled-header";
  label: string;
  /** A muted trailing count. */
  count: number;
  className?: string;
  dragging?: boolean;
  isDropTarget?: boolean;
  toggle: { expanded: boolean; onToggle: () => void };
}) {
  const shelf = props.marker === "snoozed-header" ? "snoozed" : "settled";
  return (
    <SortableSidebarMarker
      marker={props.marker}
      data-testid={`sidebar-${props.marker}`}
      className={cn("relative mx-0.5 flex h-9 items-end", props.className)}
    >
      <CollapsibleSectionHeader
        data-sidebar-row={`shelf:${shelf}`}
        onClick={props.toggle.onToggle}
        expanded={props.toggle.expanded}
        tone={props.isDropTarget ? "accent" : props.dragging ? "emphasized" : "muted"}
        data-testid={`sidebar-${shelf}-shelf-toggle`}
        accessory={<span className="font-normal tabular-nums">{props.count}</span>}
      >
        {props.label}
      </CollapsibleSectionHeader>
    </SortableSidebarMarker>
  );
}
