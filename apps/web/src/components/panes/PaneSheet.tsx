import type { ScopedThreadRef } from "@s1tools/contracts";
import { useGT, useMessages } from "gt-react";
import { PictureInPicture2Icon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { workspaceAreaProps } from "~/lib/workspaceFocus";
import {
  paneKindOf,
  paneSurface,
  sheetPane,
  useRightPanelStore,
  visiblePanes,
  type RightPanelSurface,
  type ThreadRightPanelState,
} from "~/rightPanelStore";

import { RightPanelSheet } from "../RightPanelSheet";
import { Button } from "../ui/button";
import { PaneItemSwitcher, type PaneHeaderContext } from "./PaneHeader";
import { previewFaviconOf, SurfaceIcon, surfaceTitle } from "./paneSurfacePresentation";

/**
 * Narrow windows have no room to tile: the panes open one at a time in a sheet, with a row of
 * chips to pick which one shows. Minimized panes are chips too, and picking one shows it. The
 * layout is kept for when the window widens again.
 */
export function PaneSheet(props: {
  readonly threadRef: ScopedThreadRef;
  readonly panelState: ThreadRightPanelState;
  readonly animationDurationMs: number;
  readonly header: PaneHeaderContext;
  readonly onClose: () => void;
  readonly renderContent: (surface: RightPanelSurface, visible: boolean) => ReactNode;
}) {
  const gt = useGT();
  const messages = useMessages();
  const { resolvedTheme } = useTheme();
  const { panelState, header, threadRef } = props;
  const panes = visiblePanes(panelState);
  const minimizedPanes = panelState.minimized ?? [];
  const shownPane = sheetPane(panelState);
  const surface = shownPane === null ? null : paneSurface(panelState, shownPane);
  const shownItems =
    shownPane === null
      ? []
      : panelState.surfaces.filter((entry) => paneKindOf(entry.kind) === shownPane);
  return (
    <RightPanelSheet
      animationDurationMs={props.animationDurationMs}
      open={panes.length > 0}
      onClose={props.onClose}
    >
      <div
        {...workspaceAreaProps("panel", 4, gt("Workspace panel"))}
        className="flex h-full min-h-0 flex-col"
      >
        <div
          className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center gap-1 overflow-x-auto px-2"
          role="tablist"
          aria-label={gt("Panes")}
          data-pane-sheet-picker
        >
          {[...panes, ...minimizedPanes].map((pane) => {
            const item = paneSurface(panelState, pane);
            if (!item) return null;
            const favicon = previewFaviconOf(item, header.previewSessions, header.desktopByTabId);
            const selected = pane === shownPane;
            const minimized = minimizedPanes.includes(pane);
            return (
              <button
                key={pane}
                type="button"
                role="tab"
                aria-selected={selected}
                data-pane-sheet-tab={pane}
                data-minimized={minimized ? "true" : undefined}
                className={cn(
                  "flex h-7 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm",
                  selected
                    ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
                onClick={() => {
                  const store = useRightPanelStore.getState();
                  if (minimized) store.showPane(threadRef, pane);
                  else store.focusPane(threadRef, pane);
                }}
              >
                <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
                  <SurfaceIcon
                    surface={item}
                    previewUrl={favicon.url}
                    previewCapturedUrl={favicon.capturedUrl}
                    theme={resolvedTheme}
                    environmentId={header.environmentId}
                  />
                </span>
                <span className="truncate">
                  {surfaceTitle(item, header.previewSessions, messages)}
                </span>
                {minimized ? (
                  <PictureInPicture2Icon
                    aria-label={gt("Minimized")}
                    className="size-3 shrink-0 opacity-70"
                  />
                ) : null}
              </button>
            );
          })}
          {surface !== null && shownItems.length > 1 ? (
            <PaneItemSwitcher
              items={shownItems}
              current={surface}
              context={header}
              onClose={() => header.onCloseSurface(surface)}
            />
          ) : null}
          <div className="min-w-0 flex-1" />
          {shownPane !== null ? (
            <Button
              aria-label={gt("Close pane")}
              className="shrink-0"
              size="icon-xs"
              variant="ghost-muted"
              onClick={() => header.onClosePane(shownPane)}
            >
              <XIcon className="size-3.5" />
            </Button>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col" data-right-panel-surface-content>
          {surface ? props.renderContent(surface, true) : null}
        </div>
      </div>
    </RightPanelSheet>
  );
}
