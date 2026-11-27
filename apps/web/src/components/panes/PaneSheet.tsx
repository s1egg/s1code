import type { ScopedThreadRef } from "@s1tools/contracts";
import { useGT, useMessages } from "gt-react";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { workspaceAreaProps } from "~/lib/workspaceFocus";
import {
  paneKindOf,
  paneSurface,
  useRightPanelStore,
  visiblePanes,
  type RightPanelSurface,
  type ThreadRightPanelState,
} from "~/rightPanelStore";

import { RightPanelSheet } from "../RightPanelSheet";
import { Button } from "../ui/button";
import type { PaneHeaderContext } from "./PaneHeader";
import { previewFaviconOf, SurfaceIcon, surfaceTitle } from "./paneSurfacePresentation";

/**
 * Narrow windows have no room to tile: the panes open one at a time in a sheet, with a row of
 * chips to pick which one shows. The layout is kept for when the window widens again.
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
  const active = panelState.surfaces.find((surface) => surface.id === panelState.activeSurfaceId);
  const focused =
    active && panes.includes(paneKindOf(active.kind)) ? paneKindOf(active.kind) : null;
  const shownPane = focused ?? panes[0] ?? null;
  const surface = shownPane === null ? null : paneSurface(panelState, shownPane);
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
          {panes.map((pane) => {
            const item = paneSurface(panelState, pane);
            if (!item) return null;
            const favicon = previewFaviconOf(item, header.previewSessions, header.desktopByTabId);
            const selected = pane === shownPane;
            return (
              <button
                key={pane}
                type="button"
                role="tab"
                aria-selected={selected}
                data-pane-sheet-tab={pane}
                className={cn(
                  "flex h-7 max-w-40 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm",
                  selected
                    ? "bg-background text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
                onClick={() => useRightPanelStore.getState().focusPane(threadRef, pane)}
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
              </button>
            );
          })}
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
