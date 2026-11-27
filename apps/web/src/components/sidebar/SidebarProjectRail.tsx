import type { ContextMenuSource } from "@s1tools/contracts";
import { useGT } from "gt-react";
import { MessagesSquareIcon, PlusIcon } from "lucide-react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { contextMenuSourceOf, openContextMenuFromKeyboard } from "../../contextMenuSource";
import { useEntranceOnce } from "../../hooks/useEntranceOnce";
import { cn } from "../../lib/utils";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarRailEntry, SidebarRailStatus } from "../Sidebar.logic";
import { ProjectFavicon } from "../ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarRailUtilities } from "./SidebarChrome";
import { SidebarRunGlyph } from "./SidebarRunGlyph";

function RailTile(props: {
  label: string;
  selected: boolean;
  status: SidebarRailStatus;
  onClick: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  const gt = useGT();
  const statusLabel =
    props.status === "waiting"
      ? gt("A thread is waiting for you")
      : props.status === "running"
        ? gt("A thread is working")
        : null;
  const label = statusLabel ? `${props.label} · ${statusLabel}` : props.label;
  const runEntrance = useEntranceOnce(props.status === "running");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={props.selected}
            onClick={props.onClick}
            onContextMenu={props.onContextMenu}
            onKeyDown={props.onContextMenu ? openContextMenuFromKeyboard : undefined}
            className="group/rail-tile relative grid h-10 w-full shrink-0 cursor-pointer place-items-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <span
          className={cn(
            "relative grid size-9 place-items-center rounded-lg transition-colors",
            props.selected
              ? "bg-sidebar-row-active text-sidebar-foreground ring-1 ring-inset ring-sidebar-border/80"
              : "bg-sidebar-row-hover/65 text-sidebar-muted-foreground group-hover/rail-tile:bg-sidebar-row-hover group-hover/rail-tile:text-sidebar-foreground",
          )}
        >
          {props.children}
          {props.status === "waiting" ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar bg-warning"
            />
          ) : props.status === "running" ? (
            <SidebarRunGlyph
              waiting={false}
              twinkle={runEntrance.playing}
              onAnimationEnd={runEntrance.onAnimationEnd}
              className="absolute -right-0.75 -bottom-0.75 size-3 stroke-sidebar stroke-4"
            />
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The project rail beside the thread list: one tile per project, the selected one ringed and
 * marked by a bar that slides between tiles, a badge while one of its threads works or waits
 * on the user, then the utility pages.
 */
export function SidebarProjectRail(props: {
  entries: ReadonlyArray<SidebarRailEntry<SidebarProjectSnapshot>>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onProjectContextMenu: (
    group: SidebarProjectSnapshot,
    position: { x: number; y: number },
    source: ContextMenuSource,
  ) => void;
  onAddProject: () => void;
}) {
  const gt = useGT();
  const selectedIndex = props.entries.findIndex((entry) => entry.key === props.selectedKey);
  return (
    <nav
      aria-label={gt("Projects")}
      className="flex w-15 shrink-0 flex-col items-center gap-2 pt-1 pb-2"
    >
      <div className="relative flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto pt-1 pb-1 [scrollbar-width:none]">
        {selectedIndex === -1 ? null : (
          // One bar for the whole rail, so a selection change slides it instead of swapping it.
          // Tiles are h-10 with a gap-1.5, so tile N sits N × 2.875rem below the first.
          <span
            aria-hidden
            data-rail-selection-bar={selectedIndex}
            style={{ "--rail-index": selectedIndex } as CSSProperties}
            className="pointer-events-none absolute top-4 left-1 h-4 w-0.5 translate-y-[calc(var(--rail-index)*2.875rem)] rounded-full bg-theme-accent transition-transform duration-200 ease-out motion-reduce:transition-none"
          />
        )}
        {props.entries.map((entry) => {
          const group = entry.group;
          const selected = entry.key === props.selectedKey;
          if (group === null) {
            return (
              <RailTile
                key={entry.key}
                label={gt("Threads without a project")}
                selected={selected}
                status={entry.status}
                onClick={() => props.onSelect(entry.key)}
              >
                <MessagesSquareIcon aria-hidden className="size-5 text-sidebar-muted-foreground" />
              </RailTile>
            );
          }
          return (
            <RailTile
              key={entry.key}
              label={group.displayName}
              selected={selected}
              status={entry.status}
              onClick={() => props.onSelect(entry.key)}
              onContextMenu={(event) => {
                event.preventDefault();
                props.onProjectContextMenu(
                  group,
                  { x: event.clientX, y: event.clientY },
                  contextMenuSourceOf(event),
                );
              }}
            >
              <ProjectFavicon project={group} monochromeFallback className="size-5" />
            </RailTile>
          );
        })}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={gt("Add project")}
                onClick={props.onAddProject}
                className="mt-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-sidebar-muted-foreground outline-none ring-1 ring-inset ring-sidebar-border hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            }
          >
            <PlusIcon aria-hidden className="size-4" />
          </TooltipTrigger>
          <TooltipPopup side="right">{gt("Add project")}</TooltipPopup>
        </Tooltip>
      </div>
      <SidebarRailUtilities />
    </nav>
  );
}
