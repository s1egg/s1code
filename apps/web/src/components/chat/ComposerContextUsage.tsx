import type { ContextWindowSnapshot } from "@s1tools/client-runtime/state/context-window";
import { useGT, useLocale, useMessages } from "gt-react";

import { formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";
import { InlineButton } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { formatContextWindowCompactionMessage } from "./compaction.logic";
import { ComposerSurface } from "./ComposerSurface";

/** The thread's context use under the composer, so people see when to compact before the agent does. */
export function ComposerContextUsage({
  usage,
  onCompact,
  stacked = false,
}: {
  readonly usage: ContextWindowSnapshot;
  /** Under the branch strip, which already holds the gap below the card. */
  readonly stacked?: boolean;
  /** Null when manual compaction is unavailable right now. */
  readonly onCompact: (() => void) | null;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const maxTokens = usage.maxTokens != null && usage.maxTokens > 0 ? usage.maxTokens : null;
  const used =
    maxTokens !== null && usage.usedPercentage !== null
      ? Math.round(Math.max(0, Math.min(100, usage.usedPercentage)))
      : null;
  const threshold =
    usage.compactsAutomatically === false ? null : (usage.autoCompactThreshold ?? null);
  const tick =
    maxTokens !== null && threshold !== null && threshold > 0 && threshold < maxTokens
      ? (threshold / maxTokens) * 100
      : null;
  const usedTokens = formatContextWindowTokens(usage.usedTokens);
  const tokens =
    maxTokens !== null ? `${usedTokens} / ${formatContextWindowTokens(maxTokens)}` : usedTokens;
  const tone = used === null ? null : used >= 90 ? "error" : used >= 80 ? "warning" : null;
  return (
    <ComposerSurface.ContextStrip
      className={cn("text-xs max-sm:hidden", stacked ? "h-7 pt-0.5" : "h-8")}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              tabIndex={0}
              aria-label={
                used !== null
                  ? gt("Context: {used}% used", { used })
                  : gt("Context: {usedTokens} tokens used", { usedTokens })
              }
              className="flex min-w-0 cursor-default items-center gap-2.5 rounded-md px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          {used !== null ? (
            <span
              aria-hidden
              className="relative h-[3px] w-28 shrink-0 rounded-full bg-muted-foreground/20"
            >
              {used > 0 ? (
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    tone === "error"
                      ? "bg-error"
                      : tone === "warning"
                        ? "bg-warning"
                        : "bg-primary",
                  )}
                  style={{ width: `max(${used}%, 4px)` }}
                />
              ) : null}
              {tick !== null ? (
                <span
                  className="absolute -top-[3px] h-[9px] w-px -translate-x-1/2 bg-muted-foreground"
                  style={{ left: `${tick}%` }}
                />
              ) : null}
            </span>
          ) : null}
          <span aria-hidden className="truncate tabular-nums">
            {gt("Context", { $context: "context window row label" })}{" "}
            {used !== null ? (
              <span
                className={cn(
                  "font-medium",
                  tone === "error"
                    ? "text-error-foreground"
                    : tone === "warning"
                      ? "text-warning-foreground"
                      : "text-foreground/80",
                )}
              >
                {used}%
              </span>
            ) : null}
            {used !== null ? " · " : null}
            {tokens}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="top">
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground">
              {maxTokens !== null
                ? gt("{used} of {max} tokens", {
                    used: usage.usedTokens.toLocaleString(locale),
                    max: maxTokens.toLocaleString(locale),
                  })
                : gt("Context: {usedTokens} tokens used", {
                    usedTokens: usage.usedTokens.toLocaleString(locale),
                  })}
            </span>
            {usage.compactsAutomatically === true || (threshold !== null && threshold > 0) ? (
              <span className="text-muted-foreground">
                {formatContextWindowCompactionMessage(threshold, m)}
              </span>
            ) : null}
          </div>
        </TooltipPopup>
      </Tooltip>
      <span className="flex-1" />
      {onCompact ? (
        <InlineButton tone="muted" onClick={onCompact}>
          {gt("Compact now")}
        </InlineButton>
      ) : null}
    </ComposerSurface.ContextStrip>
  );
}
