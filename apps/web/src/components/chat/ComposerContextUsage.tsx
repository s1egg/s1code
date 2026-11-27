import type { ContextWindowSnapshot } from "@s1tools/client-runtime/state/context-window";
import { useGT, useLocale } from "gt-react";
import { ChevronDownIcon } from "lucide-react";
import { useId, useState } from "react";

import { formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl } from "./ComposerControl";
import { useComposerMenuProps } from "./composerEventScope";
import { useComposerMenuState } from "./useComposerMenuState";

export function ComposerContextUsage({
  usage,
  hidden,
}: {
  readonly usage: ContextWindowSnapshot | null;
  readonly hidden: boolean;
}) {
  const gt = useGT();
  const locale = useLocale();
  const floatingProps = useComposerMenuProps();
  const [open, setOpen] = useComposerMenuState(hidden);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const breakdownId = useId();
  const title = gt("Context window");
  const noUsage = gt("No context usage reported yet");
  const maxTokens = usage?.maxTokens != null && usage.maxTokens > 0 ? usage.maxTokens : null;
  const used = maxTokens === null ? null : (usage?.usedPercentage ?? null);
  const threshold =
    usage?.compactsAutomatically === false ? null : (usage?.autoCompactThreshold ?? null);
  const tick =
    maxTokens !== null && threshold !== null && threshold > 0 && threshold < maxTokens
      ? (threshold / maxTokens) * 100
      : null;
  const usedTokens = formatContextWindowTokens(usage?.usedTokens ?? null);
  const tokens =
    maxTokens === null ? usedTokens : `${usedTokens} / ${formatContextWindowTokens(maxTokens)}`;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const summary = used === null ? tokens : `${tokens} (${percent.format(used / 100)})`;
  const label =
    usage === null
      ? noUsage
      : used === null
        ? gt("Context: {usedTokens} tokens used", { usedTokens })
        : gt("Context: {summary}", { summary });
  const tone =
    used !== null && used >= 90 ? "error" : used !== null && used >= 80 ? "warning" : "primary";
  const usageFill =
    tone === "error" ? "bg-error" : tone === "warning" ? "bg-warning" : "bg-primary";
  const fallbackRows = [
    { label: gt("Used tokens"), value: usage?.usedTokens, percentage: used, swatch: usageFill },
    { label: gt("Input tokens"), value: usage?.inputTokens, swatch: "bg-blue-500" },
    { label: gt("Cached input tokens"), value: usage?.cachedInputTokens, swatch: "bg-teal-500" },
    { label: gt("Output tokens"), value: usage?.outputTokens, swatch: "bg-orange-500" },
    { label: gt("Reasoning tokens"), value: usage?.reasoningOutputTokens, swatch: "bg-pink-500" },
    {
      label: gt("Free space", { $context: "unused context window capacity" }),
      swatch: "bg-muted-foreground/20",
      value: usage?.remainingTokens,
      percentage: usage?.remainingPercentage,
    },
  ];
  const rows = usage?.contextBreakdown?.length
    ? usage?.contextBreakdown.map((category, index) => ({
        label: category.name,
        value: category.tokens,
        swatch:
          category.kind === "used"
            ? (["bg-blue-500", "bg-orange-500", "bg-teal-500", "bg-pink-500", "bg-amber-500"][
                index % 5
              ] ?? usageFill)
            : "bg-muted-foreground/20",
        percentage:
          category.kind !== "deferred" && maxTokens !== null
            ? (category.tokens / maxTokens) * 100
            : null,
      }))
    : fallbackRows;
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
                    : "text-primary",
              )}
              style={{
                backgroundImage: `conic-gradient(currentColor ${used ?? 0}%, color-mix(in srgb, var(--muted-foreground) 30%, transparent) 0)`,
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
          {used !== null ? (
            <div
              aria-hidden="true"
              className="relative h-1 w-full rounded-full bg-muted-foreground/20"
            >
              <div className={cn("h-full rounded-full", usageFill)} style={{ width: `${used}%` }} />
              {tick !== null ? (
                <div
                  className="absolute -top-0.5 h-2 w-px bg-muted-foreground"
                  style={{ insetInlineStart: `${tick}%` }}
                />
              ) : null}
            </div>
          ) : null}
          <dl
            id={breakdownId}
            hidden={!showBreakdown}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1"
          >
            {rows.map(({ label: rowLabel, swatch, value, percentage }) =>
              value == null ? null : (
                <div key={rowLabel} className="contents">
                  <dt className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn("size-2.5 shrink-0 rounded-xs", swatch)}
                    />
                    <span>{rowLabel}</span>
                  </dt>
                  <dd className="text-end text-muted-foreground tabular-nums">
                    {formatContextWindowTokens(value)}
                  </dd>
                  <dd className="text-end tabular-nums">
                    {percentage == null ? null : percent.format(percentage / 100)}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
