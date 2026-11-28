import { ArrowLeftIcon, ArrowRightIcon, SettingsIcon } from "lucide-react";
import { useGT } from "gt-react";
import { memo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { useAtomValue } from "@effect/atom-react";
import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { shortcutLabelForCommand } from "../../keybindings";
import {
  navigateHistory,
  useCanNavigateHistory,
  type HistoryDirection,
} from "../../navigationHistory";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { cn } from "../../lib/utils";
import { S1Wordmark } from "../S1Wordmark";
import {
  resolveEnvironmentIdentificationPillLabel,
  useEnvironmentStageLabel,
} from "../environmentStage";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarHostPressureWarning } from "./SidebarHostPressureWarning";
import { observeResize } from "~/lib/observeResize";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const gt = useGT();
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
        isElectron && "drag-region",
      )}
    >
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger
          variant="ghost"
          className="relative top-auto translate-y-0"
          aria-label={gt("Toggle main sidebar")}
        />
      </div>
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <div className="flex shrink-0 items-center gap-1">
          <SidebarBrand />
          {isElectron ? (
            <div className="hidden items-center md:flex">
              <HistoryNavigationButton direction="back" />
              <HistoryNavigationButton direction="forward" />
            </div>
          ) : null}
        </div>
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function SidebarBrandWidthProbe({
  isElectron,
  onWidthChange,
}: {
  isElectron: boolean;
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex gap-1">
        <SidebarBrandMark />
        {isElectron ? <div className="w-[calc(2*var(--workspace-titlebar-control-size))]" /> : null}
      </div>
    </div>
  );
}

function HistoryNavigationButton({ direction }: { direction: HistoryDirection }) {
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const enabled = useCanNavigateHistory(direction);
  const gt = useGT();
  const label = direction === "back" ? gt("Go back") : gt("Go forward");
  const shortcutLabel = shortcutLabelForCommand(
    keybindings,
    direction === "back" ? "navigation.back" : "navigation.forward",
  );
  const Icon = direction === "back" ? ArrowLeftIcon : ArrowRightIcon;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="[-webkit-app-region:no-drag]"
            disabled={!enabled}
            onClick={() => navigateHistory(direction)}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipPopup side="bottom">
        {label}
        {shortcutLabel ? ` (${shortcutLabel})` : ""}
      </TooltipPopup>
    </Tooltip>
  );
}

function SidebarBrand() {
  const gt = useGT();
  return (
    <Link
      aria-label={gt("S1 Code home")}
      className={cn(
        "relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md text-foreground outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex",
      )}
      to="/"
    >
      <SidebarBrandMark />
    </Link>
  );
}

function SidebarBrandMark() {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight">
      <S1Wordmark aria-label="S1" className="h-[1cap] w-auto shrink-0" />
      <span className="truncate text-muted-foreground [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1">
        {/* oxlint-disable-next-line s1code/no-untranslated-copy -- product wordmark */}
        {"Code"}
      </span>
    </span>
  );
}

/** The project rail's foot. Pull requests, issues, usage, and updates live in thread details. */
export const SidebarRailUtilities = memo(function SidebarRailUtilities() {
  const navigate = useNavigate();
  const gt = useGT();
  const { isMobile, setOpenMobile } = useSidebar();
  const label = gt("Settings");
  return (
    <SidebarMenu className="items-center">
      <SidebarMenuItem className="shrink-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <SidebarMenuButton
                aria-label={label}
                onClick={() => {
                  if (isMobile) setOpenMobile(false);
                  void navigate({ to: "/settings" });
                }}
                size="icon"
              >
                <SettingsIcon />
              </SidebarMenuButton>
            }
          />
          <TooltipPopup side="right">{label}</TooltipPopup>
        </Tooltip>
      </SidebarMenuItem>
    </SidebarMenu>
  );
});

/** Notices under the thread list. Takes no room while none shows. */
export const SidebarNotices = memo(function SidebarNotices() {
  return (
    <div className="flex flex-col gap-2 px-2 pt-1 pb-2 empty:hidden">
      <SidebarHostPressureWarning />
      <SidebarThreadUndoNotice />
    </div>
  );
});
