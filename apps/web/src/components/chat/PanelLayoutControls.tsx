import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { CheckIcon, EllipsisIcon, ListIcon, type LucideIcon } from "lucide-react";
import { useGT } from "gt-react";
import { memo, type ComponentType } from "react";

import { cn } from "~/lib/utils";
import type { PaneKind } from "~/paneLayout";

import type { ThreadPanelPresentation } from "../../rightPanelLayout";
import { Kbd } from "../ui/kbd";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuShortcut, MenuTrigger } from "../ui/menu";
import { PopoverCreateHandle, PopoverTrigger } from "../ui/popover";
import { useMobileSidebarSheetMounted } from "../ui/sidebar";
import { Toggle } from "../ui/toggle";

/** One title bar icon: a pane it opens and closes. */
export interface PaneToggleControl {
  readonly pane: PaneKind;
  readonly label: string;
  readonly Icon: LucideIcon | ComponentType<{ className?: string }>;
  readonly pressed: boolean;
  readonly available: boolean;
  readonly unavailableLabel: string;
  readonly shortcutLabel: string | null;
  readonly onToggle: () => void;
}

/** An entry of the title bar's "…" menu. */
export interface PaneMoreItem {
  readonly id: string;
  readonly label: string;
  readonly Icon: LucideIcon | ComponentType<{ className?: string }>;
  readonly pressed: boolean;
  readonly available: boolean;
  readonly shortcutLabel?: string | null;
  readonly onClick: () => void;
}

export interface PanelLayoutControlsProps {
  readonly threadPanelOpen: boolean;
  readonly threadPanelPresentation: ThreadPanelPresentation;
  readonly threadPanelPopoverHandle?: ReturnType<typeof PopoverCreateHandle>;
  readonly threadPanelShortcutLabel: string | null;
  readonly onToggleThreadPanel: () => void;
  readonly toggles: readonly PaneToggleControl[];
  readonly moreItems: readonly PaneMoreItem[];
  readonly moreMenuOpen: boolean;
  readonly onMoreMenuOpenChange: (open: boolean) => void;
  readonly onCloseAllPanes: (() => void) | null;
}

function ShortcutTooltip(props: { label: string; shortcut: string | null }) {
  return (
    <span className="flex items-center gap-2">
      {props.label}
      {props.shortcut ? <Kbd>{props.shortcut}</Kbd> : null}
    </span>
  );
}

/**
 * The thread's title bar icons: thread details, then one toggle per pane, then the rest of the
 * panes in a menu. They sit in whichever header meets the window's top-right corner.
 */
export const PanelLayoutControls = memo(function PanelLayoutControls(
  props: PanelLayoutControlsProps,
) {
  const gt = useGT();
  const mobileSidebarSheetMounted = useMobileSidebarSheetMounted();
  const threadPanelToggle = (
    <Toggle
      className="relative shrink-0 [-webkit-app-region:no-drag]"
      pressed={props.threadPanelOpen}
      onPressedChange={
        props.threadPanelPresentation === "popover" ? undefined : props.onToggleThreadPanel
      }
      aria-label={gt("Toggle thread details panel")}
      variant="ghost"
      size="sm"
    >
      <ListIcon className="size-4" />
    </Toggle>
  );
  return (
    <div
      className={cn(
        "flex h-full shrink-0 items-center gap-1 [-webkit-app-region:no-drag]",
        mobileSidebarSheetMounted && "hidden",
      )}
      data-panel-layout-controls
      data-workspace-titlebar-controls
    >
      <Tooltip>
        <TooltipTrigger render={<span className="flex shrink-0" data-thread-panel-toggle />}>
          {props.threadPanelPresentation === "popover" ? (
            <PopoverTrigger handle={props.threadPanelPopoverHandle} render={threadPanelToggle} />
          ) : (
            threadPanelToggle
          )}
        </TooltipTrigger>
        <TooltipPopup side="bottom">
          <ShortcutTooltip label={gt("Thread details")} shortcut={props.threadPanelShortcutLabel} />
        </TooltipPopup>
      </Tooltip>
      {props.toggles.map((toggle) => (
        <Tooltip key={toggle.pane}>
          <TooltipTrigger render={<span className="flex shrink-0" />}>
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              pressed={toggle.pressed}
              onPressedChange={toggle.onToggle}
              aria-label={toggle.label}
              data-pane-toggle={toggle.pane}
              variant="ghost"
              size="sm"
              disabled={!toggle.available}
            >
              <toggle.Icon className="size-4" />
            </Toggle>
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {toggle.available ? (
              <ShortcutTooltip label={toggle.label} shortcut={toggle.shortcutLabel} />
            ) : (
              toggle.unavailableLabel
            )}
          </TooltipPopup>
        </Tooltip>
      ))}
      <Menu open={props.moreMenuOpen} onOpenChange={props.onMoreMenuOpenChange}>
        <MenuTrigger
          render={
            <Toggle
              className="shrink-0 [-webkit-app-region:no-drag]"
              aria-label={gt("More panes")}
              data-pane-more
              variant="ghost"
              size="sm"
            />
          }
        >
          <EllipsisIcon className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end" side="bottom" sideOffset={6} className="min-w-52">
          {props.moreItems.map((item) => (
            <MenuItem
              key={item.id}
              disabled={!item.available}
              onClick={item.onClick}
              data-pane-more-item={item.id}
            >
              <item.Icon />
              {item.label}
              {item.pressed ? (
                <MenuShortcut>
                  <CheckIcon className="size-3.5" />
                </MenuShortcut>
              ) : item.shortcutLabel ? (
                <MenuShortcut>{item.shortcutLabel}</MenuShortcut>
              ) : null}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            disabled={props.onCloseAllPanes === null}
            onClick={() => props.onCloseAllPanes?.()}
          >
            {gt("Close all panes")}
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
});
