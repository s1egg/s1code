import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

export function SettingsGroup({
  variant = "grouped",
  divided = true,
  className,
  ...props
}: ComponentProps<"div"> & {
  variant?: "grouped" | "plain";
  divided?: boolean;
}) {
  return (
    <div
      data-slot="settings-group"
      {...props}
      className={cn(
        "relative overflow-visible text-foreground",
        variant === "grouped"
          ? "rounded-2xl border border-border/70 bg-card/40 shadow-xs/5 dark:border-border dark:bg-foreground/[0.03] dark:shadow-none"
          : "space-y-1",
        variant === "grouped" &&
          divided &&
          "*:not-first:border-t *:not-first:border-border/50 dark:*:not-first:border-border/80 [&>[data-slot=settings-row]]:rounded-none",
        className,
      )}
    />
  );
}
