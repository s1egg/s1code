import type { ContextWindowSnapshot } from "@s1tools/client-runtime/state/context-window";
import { useGT, useLocale } from "gt-react";
import type { ComponentProps } from "react";

import { formatContextWindowTokens } from "../../lib/contextWindow";
import { cn } from "../../lib/utils";

/** What the composer's context meter and the thread details Context view both show. */
export function useContextWindowUsage(usage: ContextWindowSnapshot | null) {
  const gt = useGT();
  const locale = useLocale();
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
  const tone: "error" | "warning" | "primary" =
    used !== null && used >= 90 ? "error" : used !== null && used >= 80 ? "warning" : "primary";
  const usageFill =
    tone === "error" ? "bg-error" : tone === "warning" ? "bg-warning" : "bg-context-meter";
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
  const rows: ReadonlyArray<{
    label: string;
    value: number | null | undefined;
    swatch: string;
    percentage?: number | null | undefined;
  }> = usage?.contextBreakdown?.length
    ? usage.contextBreakdown.map((category, index) => ({
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
  return { title, noUsage, used, tick, summary, label, tone, usageFill, rows, percent };
}

type ContextWindowUsage = ReturnType<typeof useContextWindowUsage>;

export function ContextWindowMeter({ usage }: { readonly usage: ContextWindowUsage }) {
  if (usage.used === null) return null;
  return (
    <div aria-hidden="true" className="relative h-1 w-full rounded-full bg-context-meter-track">
      <div
        className={cn("h-full rounded-full", usage.usageFill)}
        style={{ width: `${usage.used}%` }}
      />
      {usage.tick !== null ? (
        <div
          className="absolute -top-0.5 h-2 w-px bg-muted-foreground"
          style={{ insetInlineStart: `${usage.tick}%` }}
        />
      ) : null}
    </div>
  );
}

export function ContextWindowBreakdown({
  usage,
  ...props
}: Omit<ComponentProps<"dl">, "className" | "children"> & {
  readonly usage: ContextWindowUsage;
}) {
  return (
    <dl
      {...props}
      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1"
    >
      {usage.rows.map(({ label, swatch, value, percentage }) =>
        value == null ? null : (
          <div key={label} className="contents">
            <dt className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-xs", swatch)} />
              <span className="min-w-0 truncate">{label}</span>
            </dt>
            <dd className="text-end text-muted-foreground tabular-nums">
              {formatContextWindowTokens(value)}
            </dd>
            <dd className="text-end tabular-nums">
              {percentage == null ? null : usage.percent.format(percentage / 100)}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}
