import type { ContextWindowSnapshot } from "@s1tools/client-runtime/state/context-window";
import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";

import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl } from "./ComposerControl";
import {
  ContextWindowBreakdown,
  ContextWindowMeter,
  useContextWindowUsage,
} from "./contextWindowUsage";
import { useComposerMenuProps } from "./composerEventScope";
import { useComposerMenuState } from "./useComposerMenuState";

export function ComposerContextUsage({
  usage,
  hidden,
}: {
  readonly usage: ContextWindowSnapshot | null;
  readonly hidden: boolean;
}) {
  const floatingProps = useComposerMenuProps();
  const [open, setOpen] = useComposerMenuState(hidden);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdownId = useId();
  const context = useContextWindowUsage(usage);
  const { title, noUsage, used, summary, label, tone } = context;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setShowBreakdown(false);
        setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
          <PopoverTrigger
            render={
              <ComposerControl
                aria-label={label}
                className="size-7 px-0 data-popup-open:bg-accent"
              />
            }
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-3.5 rounded-full [mask-image:radial-gradient(closest-side,transparent_calc(100%-2px),black_calc(100%-1.5px))]",
                tone === "error"
                  ? "text-error"
                  : tone === "warning"
                    ? "text-warning"
                    : "text-context-meter",
              )}
              style={{
                backgroundImage: `conic-gradient(currentColor ${used ?? 0}%, var(--context-meter-track) 0)`,
              }}
            />
          </PopoverTrigger>
        </TooltipTrigger>
        {!open ? (
          <TooltipPopup role="tooltip" side="top">
            {label}
          </TooltipPopup>
        ) : null}
      </Tooltip>
      <PopoverPopup
        side="top"
        align="end"
        animateScale={false}
        className="w-90 max-w-[calc(100vw-2rem)]"
        {...floatingProps}
      >
        <div className="grid gap-2.5 text-sm">
          <PopoverTitle className="sr-only">{title}</PopoverTitle>
          {usage === null ? (
            <div className="grid gap-1">
              <span className="text-foreground">{title}</span>
              <span className="text-muted-foreground">{noUsage}</span>
            </div>
          ) : (
            <ComposerControl
              size="sm"
              className="h-auto min-w-0 justify-between px-0 py-0.5 font-normal text-muted-foreground hover:bg-transparent hover:text-muted-foreground [&:active:not([aria-haspopup])]:scale-100"
              aria-expanded={showBreakdown}
              aria-controls={breakdownId}
              onClick={() => setShowBreakdown(!showBreakdown)}
            >
              <span className="min-w-0 truncate">{title}</span>
              <span className="flex shrink-0 items-center gap-2.5 tabular-nums">
                {summary}
                <ChevronDownIcon
                  aria-hidden="true"
                  className={cn("size-3.5", !showBreakdown && "-rotate-90 rtl:rotate-90")}
                />
              </span>
            </ComposerControl>
          )}
          <ContextWindowMeter usage={context} />
          <ContextWindowBreakdown id={breakdownId} hidden={!showBreakdown} usage={context} />
        </div>
      </PopoverPopup>
    </Popover>
  );
}
