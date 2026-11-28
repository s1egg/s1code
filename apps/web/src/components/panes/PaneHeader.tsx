import type { EnvironmentId, PreviewSessionSnapshot } from "@s1tools/contracts";
import { msg, useGT, useMessages } from "gt-react";
import {
  ArrowDownToLineIcon,
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ArrowUpToLineIcon,
  ChevronDownIcon,
  EllipsisIcon,
  Maximize2Icon,
  Minimize2Icon,
  PictureInPicture2Icon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useState } from "react";

import { isElectron } from "~/env";
import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import type { PaneKind, PaneSide } from "~/paneLayout";
import type { DesktopPreviewOverlay } from "~/previewStateStore";
import type { RightPanelSurface } from "~/rightPanelStore";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  DeviceTabTooltip,
  previewFaviconOf,
  SIDE_CHAT_STATE_LABELS,
  SurfaceIcon,
  surfaceTitle,
  usePaneSurfaceTitle,
} from "./paneSurfacePresentation";

/** One entry of a pane's own "…" menu, such as a browser's Duplicate. */
export interface PaneMenuItem {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

export interface PaneHeaderContext {
  readonly environmentId: EnvironmentId;
  readonly previewSessions: Readonly<Record<string, PreviewSessionSnapshot>>;
  readonly desktopByTabId: Readonly<Record<string, DesktopPreviewOverlay>>;
  readonly pendingSurfaceIds: ReadonlySet<string>;
  /** Browser pages opened elsewhere that the user has not looked at yet. */
  readonly waitingSurfaceIds: ReadonlySet<string>;
  readonly onActivateSurface: (surface: RightPanelSurface) => void;
  readonly onMinimizePane: (pane: PaneKind) => void;
  readonly onCloseSurface: (surface: RightPanelSurface) => void;
  readonly onClosePane: (pane: PaneKind) => void;
  readonly onRenameDevice: (surfaceId: string, title: string) => void;
  readonly paneMenuItems: (pane: PaneKind, surface: RightPanelSurface) => PaneMenuItem[];
}

const MOVE_ACTIONS = [
  { side: "left", label: msg("Move to left"), Icon: ArrowLeftToLineIcon },
  { side: "right", label: msg("Move to right"), Icon: ArrowRightToLineIcon },
  { side: "top", label: msg("Move to top"), Icon: ArrowUpToLineIcon },
  { side: "bottom", label: msg("Move to bottom"), Icon: ArrowDownToLineIcon },
] as const;

export function PaneHeader(props: {
  readonly pane: PaneKind;
  readonly surface: RightPanelSurface;
  readonly items: readonly RightPanelSurface[];
  readonly context: PaneHeaderContext;
  readonly focused: boolean;
  readonly filled: boolean;
  readonly topRow: boolean;
  readonly topLeft: boolean;
  /** Meets the window's top-right corner, where Windows draws its window controls. */
  readonly topRight: boolean;
  readonly trailing: ReactNode;
  readonly onChipPointerDown: (event: ReactPointerEvent<HTMLElement>, title: string) => void;
  readonly onMove: (side: PaneSide) => void;
  readonly onToggleFill: () => void;
}) {
  const gt = useGT();
  const messages = useMessages();
  const { resolvedTheme } = useTheme();
  const { surface, context } = props;
  const [renaming, setRenaming] = useState(false);
  const baseTitle = surfaceTitle(surface, context.previewSessions, messages);
  const { title, sideChatState } = usePaneSurfaceTitle(surface, baseTitle, context.environmentId);
  const favicon = previewFaviconOf(surface, context.previewSessions, context.desktopByTabId);
  const ownsTitleBar = isElectron && props.topRow;
  const menuItems = context.paneMenuItems(props.pane, surface);
  const waitingCount = props.items.filter((item) => context.waitingSurfaceIds.has(item.id)).length;
  const audible =
    surface.kind === "preview" && surface.resourceId !== null
      ? (context.desktopByTabId[surface.resourceId]?.audible ?? false)
      : false;
  const icon = (
    <span className="relative inline-flex size-3.5 shrink-0 items-center justify-center">
      <SurfaceIcon
        surface={surface}
        previewUrl={favicon.url}
        previewCapturedUrl={favicon.capturedUrl}
        theme={resolvedTheme}
        environmentId={context.environmentId}
      />
      {context.pendingSurfaceIds.has(surface.id) ? (
        <span
          className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-current"
          aria-hidden
        />
      ) : null}
    </span>
  );
  const finishRename = (value: string) => {
    context.onRenameDevice(surface.id, value);
    setRenaming(false);
  };

  return (
    <div
      data-pane-header={props.pane}
      className={cn(
        "flex shrink-0 items-center gap-1 pr-2 pl-2",
        props.topRow
          ? "h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)]"
          : "h-9 min-h-9",
        ownsTitleBar && "drag-region",
        ownsTitleBar && props.topRight && "wco:pr-(--workspace-native-controls-inset)",
        props.topLeft && props.topRow && COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
      )}
    >
      {renaming ? (
        <input
          aria-label={gt("Device name")}
          className="h-7 w-36 min-w-0 rounded-lg bg-background px-2 text-sm outline-none ring-1 ring-inset ring-ring [-webkit-app-region:no-drag]"
          defaultValue={title}
          ref={(element) => {
            element?.focus();
            element?.select();
          }}
          onBlur={(event) => finishRename(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = title;
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <div
                role="button"
                tabIndex={0}
                data-pane-chip={props.pane}
                data-focused={props.focused ? "true" : undefined}
                aria-label={
                  sideChatState === null
                    ? gt("{title} pane", { title })
                    : gt("{title}, {state}", {
                        title,
                        state: messages(SIDE_CHAT_STATE_LABELS[sideChatState]),
                      })
                }
                className={cn(
                  "group/chip relative flex h-7 max-w-52 min-w-0 cursor-grab touch-none select-none items-center gap-1.5 rounded-lg pr-2 pl-2 text-sm outline-none [-webkit-app-region:no-drag] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing",
                  props.focused
                    ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
                onPointerDown={(event) => props.onChipPointerDown(event, title)}
                onDoubleClick={() => {
                  if (surface.kind === "device") setRenaming(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    context.onClosePane(props.pane);
                  }
                }}
              >
                {icon}
                <span className="min-w-0 truncate group-hover/chip:[mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)] group-focus-within/chip:[mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)]">
                  {title}
                </span>
                {audible ? (
                  <Volume2Icon
                    aria-label={gt("Playing audio")}
                    className="size-3.5 shrink-0 text-muted-foreground"
                    data-pane-audio
                  />
                ) : null}
                {waitingCount > 0 ? (
                  <span
                    aria-label={gt(
                      "{count, plural, one {{count} page waiting} other {{count} pages waiting}}",
                      { count: waitingCount },
                    )}
                    className="shrink-0 rounded-full bg-primary px-1.5 font-medium text-3xs text-primary-foreground leading-4 tabular-nums"
                    data-pane-waiting={waitingCount}
                  >
                    {waitingCount}
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={gt("Close {title}", { title })}
                  className="absolute top-1/2 right-1 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover/chip:opacity-100"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    context.onClosePane(props.pane);
                  }}
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            }
          />
          <TooltipPopup side="bottom">
            {surface.kind === "device" ? (
              <DeviceTabTooltip
                surface={surface}
                environmentId={context.environmentId}
                title={title}
              />
            ) : (
              title
            )}
          </TooltipPopup>
        </Tooltip>
      )}
      {props.items.length > 1 ? (
        <PaneItemSwitcher
          items={props.items}
          current={surface}
          context={context}
          onClose={() => context.onCloseSurface(surface)}
        />
      ) : null}
      <div className="min-w-0 flex-1" />
      <Menu>
        <MenuTrigger
          render={
            <Button
              aria-label={gt("{title} options", { title })}
              className="shrink-0 [-webkit-app-region:no-drag]"
              size="icon-xs"
              variant="ghost-muted"
            />
          }
        >
          <EllipsisIcon className="size-4" />
        </MenuTrigger>
        <MenuPopup align="end" side="bottom" sideOffset={6} className="min-w-48">
          {menuItems.map((item) => (
            <MenuItem key={item.id} disabled={item.disabled === true} onClick={item.onClick}>
              {item.label}
            </MenuItem>
          ))}
          {surface.kind === "device" ? (
            <MenuItem onClick={() => setRenaming(true)}>{gt("Rename")}</MenuItem>
          ) : null}
          {menuItems.length > 0 || surface.kind === "device" ? <MenuSeparator /> : null}
          {MOVE_ACTIONS.map((action) => (
            <MenuItem key={action.side} onClick={() => props.onMove(action.side)}>
              <action.Icon />
              {messages(action.label)}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={() => context.onClosePane(props.pane)}>{gt("Close pane")}</MenuItem>
        </MenuPopup>
      </Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={gt("Minimize {title}", { title })}
              className="shrink-0 [-webkit-app-region:no-drag]"
              size="icon-xs"
              variant="ghost-muted"
              onClick={() => context.onMinimizePane(props.pane)}
              data-pane-minimize={props.pane}
            />
          }
        >
          <PictureInPicture2Icon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="bottom">{gt("Minimize")}</TooltipPopup>
      </Tooltip>
      {props.filled ? (
        <Button
          size="xs"
          variant="secondary"
          className="shrink-0 [-webkit-app-region:no-drag]"
          onClick={props.onToggleFill}
          data-pane-show-session
        >
          <Minimize2Icon />
          {gt("Show session")}
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={gt("Fill the window with {title}", { title })}
                className="shrink-0 [-webkit-app-region:no-drag]"
                size="icon-xs"
                variant="ghost-muted"
                onClick={props.onToggleFill}
              />
            }
          >
            <Maximize2Icon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup side="bottom">{gt("Fill window")}</TooltipPopup>
        </Tooltip>
      )}
      {props.trailing}
    </div>
  );
}

/** The floating window's header: what it shows, and buttons to put it back or close it. */
export function FloatingPaneHeader(props: {
  readonly pane: PaneKind;
  readonly surface: RightPanelSurface;
  readonly context: PaneHeaderContext;
  readonly onRestore: () => void;
}) {
  const gt = useGT();
  const messages = useMessages();
  const { resolvedTheme } = useTheme();
  const { surface, context } = props;
  const { title } = usePaneSurfaceTitle(
    surface,
    surfaceTitle(surface, context.previewSessions, messages),
    context.environmentId,
  );
  const favicon = previewFaviconOf(surface, context.previewSessions, context.desktopByTabId);
  return (
    <div
      data-floating-pane-header={props.pane}
      className="flex h-8 shrink-0 items-center gap-1.5 pr-1 pl-2.5 text-sm"
    >
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        <SurfaceIcon
          surface={surface}
          previewUrl={favicon.url}
          previewCapturedUrl={favicon.capturedUrl}
          theme={resolvedTheme}
          environmentId={context.environmentId}
        />
      </span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label={gt("Restore {title}", { title })}
              className="shrink-0"
              size="icon-xs"
              variant="ghost-muted"
              onClick={props.onRestore}
              data-floating-pane-restore={props.pane}
            />
          }
        >
          <Maximize2Icon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="top">{gt("Restore")}</TooltipPopup>
      </Tooltip>
      <Button
        aria-label={gt("Close {title}", { title })}
        className="shrink-0"
        size="icon-xs"
        variant="ghost-muted"
        onClick={() => context.onClosePane(props.pane)}
        data-floating-pane-close={props.pane}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

export function PaneItemSwitcher(props: {
  readonly items: readonly RightPanelSurface[];
  readonly current: RightPanelSurface;
  readonly context: PaneHeaderContext;
  readonly onClose: () => void;
}) {
  const gt = useGT();
  const { context } = props;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            aria-label={gt("Switch item")}
            className="shrink-0 [-webkit-app-region:no-drag]"
            size="icon-xs"
            variant="ghost-muted"
          />
        }
      >
        <ChevronDownIcon className="size-3.5" />
      </MenuTrigger>
      <MenuPopup align="start" side="bottom" sideOffset={6} className="max-w-72">
        <MenuRadioGroup value={props.current.id}>
          {props.items.map((item) => (
            <MenuRadioItem
              key={item.id}
              value={item.id}
              closeOnClick
              onClick={() => context.onActivateSurface(item)}
            >
              <PaneItemTitle item={item} context={context} />
              {context.waitingSurfaceIds.has(item.id) ? (
                <span
                  aria-label={gt("Waiting")}
                  className="ms-auto size-1.5 shrink-0 rounded-full bg-primary"
                  data-pane-item-waiting
                />
              ) : null}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onClick={props.onClose}>{gt("Close this item")}</MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function PaneItemTitle(props: {
  readonly item: RightPanelSurface;
  readonly context: PaneHeaderContext;
}) {
  const messages = useMessages();
  const { title } = usePaneSurfaceTitle(
    props.item,
    surfaceTitle(props.item, props.context.previewSessions, messages),
    props.context.environmentId,
  );
  return <span className="min-w-0 truncate">{title}</span>;
}
