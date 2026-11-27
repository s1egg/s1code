import type { ContextMenuSource } from "@s1tools/contracts";
import { useGT } from "gt-react";
import { MessagesSquareIcon, PlusIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { contextMenuSourceOf, openContextMenuFromKeyboard } from "../../contextMenuSource";
import { cn } from "../../lib/utils";
import { projectIconColorClassName } from "../../projectIconColors";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarRailEntry, SidebarRailStatus } from "../Sidebar.logic";
import { ProjectFavicon } from "../ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarRailUtilities } from "./SidebarChrome";

function RailTile(props: {
  label: string;
  selected: boolean;
  colorClassName: string | null;
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
  // The ring sits inside the button, around a smaller tile, so the scroll area cannot clip it.
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
            className={cn(
              "group/rail-tile grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              props.colorClassName,
              props.selected &&
                cn(
                  "ring-2 ring-inset",
                  props.colorClassName === null ? "ring-primary" : "ring-current",
                ),
            )}
          />
        }
      >
        <span
          className={cn(
            "relative grid size-9 place-items-center rounded-lg transition-opacity",
            props.colorClassName === null
              ? "bg-sidebar-row-hover text-sidebar-foreground"
              : "bg-current/12",
            props.selected ? "opacity-100" : "opacity-75 group-hover/rail-tile:opacity-100",
          )}
        >
          {props.children}
          {props.status !== null ? (
            <span
              aria-hidden
              className={cn(
                "absolute -right-1 -bottom-1 size-3 rounded-full border-2 border-sidebar",
                props.status === "waiting" ? "bg-warning" : "bg-success",
              )}
            />
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The project rail beside the thread list: one tile per project, the selected one ringed,
 * a badge while one of its threads works or waits on the user, then the utility pages.
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
  return (
    <nav
      aria-label={gt("Projects")}
      className="flex w-15 shrink-0 flex-col items-center gap-2 pt-1 pb-2"
    >
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto pt-1 pb-1 [scrollbar-width:none]">
        {props.entries.map((entry) => {
          const group = entry.group;
          const selected = entry.key === props.selectedKey;
          if (group === null) {
            return (
              <RailTile
                key={entry.key}
                label={gt("Threads without a project")}
                selected={selected}
                colorClassName={null}
                status={entry.status}
                onClick={() => props.onSelect(entry.key)}
              >
                <MessagesSquareIcon aria-hidden className="size-5 text-sidebar-muted-foreground" />
              </RailTile>
            );
          }
          const color =
            group.projectIcon?.kind === "monogram" || group.projectIcon?.kind === "lucide"
              ? group.projectIcon.color
              : null;
          return (
            <RailTile
              key={entry.key}
              label={group.displayName}
              selected={selected}
              colorClassName={color === null ? null : projectIconColorClassName(color)}
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
              <ProjectFavicon project={group} className="size-5" />
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
