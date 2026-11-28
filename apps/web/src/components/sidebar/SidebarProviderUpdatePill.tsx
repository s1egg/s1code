import { Spinner } from "~/components/ui/spinner";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import type { ServerProvider } from "@s1tools/contracts";
import { CircleCheckIcon, DownloadIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { T, useGT, useMessages } from "gt-react";
import { useEffect, useEffectEvent, useState, type CSSProperties } from "react";
import { create } from "zustand";

import { primaryServerProvidersAtom } from "../../state/server";
import {
  getProviderUpdateSidebarPillView,
  type ProviderUpdateSidebarPillView,
  terminalUpdateKey,
} from "../ProviderUpdateLaunchNotification.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

// Matches the pill's `duration-180` class.
const PROVIDER_UPDATE_PILL_EXIT_MS = 180;

const PROVIDER_UPDATE_PILL_STYLES = {
  loading:
    "bg-sidebar-control-surface text-sidebar-foreground group-has-[button[data-provider-update-main]:hover]/provider-update:bg-sidebar-row-hover",
  success:
    "bg-sidebar-control-surface text-sidebar-foreground group-has-[button[data-provider-update-main]:hover]/provider-update:bg-sidebar-row-hover",
  warning:
    "bg-warning/12 text-warning group-has-[button[data-provider-update-main]:hover]/provider-update:bg-warning/18",
  error:
    "bg-destructive/12 text-destructive group-has-[button[data-provider-update-main]:hover]/provider-update:bg-destructive/18",
} as const;

const PROVIDER_UPDATE_PILL_PROGRESS_STYLES = {
  success: "bg-foreground/8",
  warning: "bg-warning/14",
  error: "bg-destructive/14",
} as const;

function latestProviderCheckedAt(
  providers: ReadonlyArray<Pick<ServerProvider, "checkedAt">>,
): string | undefined {
  return providers.reduce<string | undefined>(
    (latest, provider) =>
      latest === undefined || provider.checkedAt > latest ? provider.checkedAt : latest,
    undefined,
  );
}

// Lives for the session, not the pill: the docked and popover thread details mount their own pill,
// and closing either must not bring back a notice the user dismissed.
const useProviderUpdateNoticeStore = create<{
  readonly dismissedKeys: ReadonlySet<string>;
  /** Only updates that finish after the first providers this session saw get a notice. */
  readonly visibleAfterIso: string | undefined;
}>()(() => ({ dismissedKeys: new Set(), visibleAfterIso: undefined }));

/** Keeps only dismissals some provider still reports, so the set never outgrows the providers. */
function recordDismissedKeys(
  keys: ReadonlyArray<string>,
  providers: ReadonlyArray<ServerProvider>,
) {
  const reported = new Set(providers.map(terminalUpdateKey));
  useProviderUpdateNoticeStore.setState((previous) => ({
    dismissedKeys: new Set([...previous.dismissedKeys, ...keys].filter((key) => reported.has(key))),
  }));
}

export function SidebarProviderUpdatePill() {
  const gt = useGT();
  const messages = useMessages();
  const navigate = useNavigate();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const dismissedKeys = useProviderUpdateNoticeStore((state) => state.dismissedKeys);
  const visibleAfterIso = useProviderUpdateNoticeStore((state) => state.visibleAfterIso);
  const [renderedView, setRenderedView] = useState<ProviderUpdateSidebarPillView | null>(null);
  const [pendingView, setPendingView] = useState<ProviderUpdateSidebarPillView | null>(null);
  const [exitingKey, setExitingKey] = useState<string | null>(null);
  const effectiveVisibleAfterIso = visibleAfterIso ?? latestProviderCheckedAt(providers);
  const view = getProviderUpdateSidebarPillView(
    providers,
    {
      ...(effectiveVisibleAfterIso !== undefined
        ? { visibleAfterIso: effectiveVisibleAfterIso }
        : {}),
      dismissedKeys,
    },
    messages,
  );

  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- records the session's notice baseline in its session-lived store the first time providers arrive
  useEffect(() => {
    if (effectiveVisibleAfterIso === undefined) return;
    if (useProviderUpdateNoticeStore.getState().visibleAfterIso !== undefined) return;
    useProviderUpdateNoticeStore.setState({ visibleAfterIso: effectiveVisibleAfterIso });
  }, [effectiveVisibleAfterIso]);

  const openProviderSettings = () => {
    void navigate({ to: "/settings/providers" });
  };
  const displayedView = renderedView?.key === view?.key ? view : (renderedView ?? view);
  const dismissAfterVisibleMs = displayedView?.dismissAfterVisibleMs;
  const viewKey = displayedView?.key ?? null;
  const showDismissProgress =
    dismissAfterVisibleMs !== undefined &&
    displayedView?.tone !== "loading" &&
    exitingKey !== viewKey;

  const startExit = (
    key: string,
    nextView: ProviderUpdateSidebarPillView | null,
    dismissKeys: ReadonlyArray<string> = [],
  ) => {
    if (exitingKey === key) {
      return;
    }
    // Recorded now: thread details can close before the exit finishes. The pill keeps showing the
    // notice it renders until then.
    if (dismissKeys.length > 0) recordDismissedKeys(dismissKeys, providers);
    setPendingView(nextView);
    setExitingKey(key);
  };

  if (exitingKey === null) {
    if (!renderedView) {
      if (view) {
        setRenderedView(view);
      }
    } else if (!view) {
      startExit(renderedView.key, null);
    } else if (view.key !== renderedView.key) {
      startExit(renderedView.key, view);
    }
  }

  const exitAfterVisible = useEffectEvent((key: string) =>
    startExit(key, null, displayedView?.dismissKeys),
  );

  const finishExit = useEffectEvent(() => {
    setRenderedView(pendingView);
    setPendingView(null);
    setExitingKey(null);
  });

  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- fallback timer that finishes the exit if the CSS transition never ends
  useEffect(() => {
    if (exitingKey === null) return;
    // A cancelled or skipped CSS transition must not keep a hidden spinner mounted.
    const timeoutId = window.setTimeout(finishExit, PROVIDER_UPDATE_PILL_EXIT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [exitingKey]);

  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- timer that dismisses the pill after it has been visible for dismissAfterVisibleMs
  useEffect(() => {
    if (!dismissAfterVisibleMs || !viewKey) {
      return;
    }
    if (exitingKey === viewKey) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      exitAfterVisible(viewKey);
    }, dismissAfterVisibleMs);

    return () => window.clearTimeout(timeoutId);
  }, [dismissAfterVisibleMs, exitingKey, viewKey]);

  if (!displayedView) {
    return null;
  }

  return (
    <div
      className={`group/provider-update relative flex min-h-7 w-full shrink-0 items-center overflow-hidden rounded-lg text-2xs leading-4 font-medium transform-gpu transition-all duration-180 ease-drawer will-change-transform ${
        PROVIDER_UPDATE_PILL_STYLES[displayedView.tone]
      } ${
        exitingKey === displayedView.key
          ? "pointer-events-none translate-y-1.5 opacity-0"
          : "translate-y-0 opacity-100"
      }`}
    >
      {showDismissProgress ? (
        <div
          key={displayedView.key}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 w-full origin-left scale-x-0 transition-transform duration-(--provider-update-pill-dismiss-ms) ease-linear starting:scale-x-100 border-r border-current/15 inset-shadow-2xs inset-shadow-white/8 ${
            PROVIDER_UPDATE_PILL_PROGRESS_STYLES[displayedView.tone]
          }`}
          style={
            {
              "--provider-update-pill-dismiss-ms": `${dismissAfterVisibleMs}ms`,
            } as CSSProperties
          }
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 rounded-lg transition-colors" />
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={displayedView.description}
              data-provider-update-main
              className="relative z-[1] flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
              onClick={openProviderSettings}
            >
              {displayedView.tone === "loading" ? (
                <Spinner size="sm" className="shrink-0" />
              ) : displayedView.tone === "success" ? (
                <CircleCheckIcon className="size-3.5 shrink-0" />
              ) : displayedView.tone === "error" ? (
                <TriangleAlertIcon className="size-3.5 shrink-0" />
              ) : (
                <DownloadIcon className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 wrap-break-word">{displayedView.title}</span>
            </button>
          }
        />
        <TooltipPopup side="top">{displayedView.description}</TooltipPopup>
      </Tooltip>
      {displayedView.dismissible && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={gt("Dismiss provider update notice")}
                className="relative z-[1] mr-1 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md opacity-70 outline-none hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => startExit(displayedView.key, null, displayedView.dismissKeys)}
              >
                <XIcon className="size-3.5 shrink-0" />
              </button>
            }
          />
          <TooltipPopup side="top">
            <T>Dismiss until provider status changes</T>
          </TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
}
