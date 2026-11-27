import type { ComponentProps } from "react";

import { cn } from "~/lib/utils";

function Shell({
  contextRow = false,
  separateControls = false,
  className,
  ...props
}: ComponentProps<"div"> & { contextRow?: boolean; separateControls?: boolean }) {
  return (
    <div
      data-slot="composer-shell"
      data-context-row={contextRow || undefined}
      data-separate-controls={separateControls || undefined}
      className={cn(
        "@container/composer-surface group/composer-surface relative isolate mx-auto w-full max-w-(--chat-content-max-width)",
        // Opaque: the composer stack already hides the timeline, so glass would only dim the card.
        "[--chat-composer-drawer-inset:1.375rem] [--chat-composer-surface:var(--surface-raised)] [--chat-composer-outline:var(--input)]",
        "dark:[--chat-composer-highlight:transparent] dark:[--chat-composer-outline:transparent]",
        "[html[data-theme-id]_&]:[--chat-composer-outline:var(--app-theme-toolbar-border)]",
        "dark:[html[data-theme-id]_&]:[--chat-composer-highlight:color-mix(in_srgb,var(--app-theme-input)_12%,transparent)] dark:[html[data-theme-id]_&]:[--chat-composer-outline:color-mix(in_srgb,var(--app-theme-input)_30%,var(--background))]",
        "before:pointer-events-none before:absolute before:inset-0 before:z-0 before:rounded-2xl before:bg-(--chat-composer-surface)",
        "has-data-[composer-banner-surface=attached]:before:hidden",
        "data-context-row:before:hidden data-separate-controls:before:hidden",
        className,
      )}
      {...props}
    />
  );
}

const outlineClasses =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:border after:border-(--chat-composer-outline) dark:after:inset-shadow-2xs dark:after:inset-shadow-(color:--chat-composer-highlight)";

function Host({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-host"
      className={cn(
        "relative z-10 w-full rounded-2xl shadow-composer after:z-1 dark:shadow-composer-dark",
        "group-data-context-row/composer-surface:before:pointer-events-none group-data-context-row/composer-surface:before:absolute group-data-context-row/composer-surface:before:inset-0 group-data-context-row/composer-surface:before:-z-1 group-data-context-row/composer-surface:before:rounded-2xl group-data-context-row/composer-surface:before:bg-(--chat-composer-surface)",
        outlineClasses,
        "group-data-separate-controls/composer-surface:shadow-none group-data-separate-controls/composer-surface:before:hidden group-data-separate-controls/composer-surface:after:hidden dark:group-data-separate-controls/composer-surface:shadow-none",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-none dark:group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-none group-has-data-[composer-banner-surface=attached]/composer-surface:before:hidden group-has-data-[composer-banner-surface=attached]/composer-surface:after:hidden",
        className,
      )}
      {...props}
    />
  );
}

function Main({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-chat-composer-main-surface="true"
      className={cn(
        "group relative z-10 rounded-2xl p-px",
        outlineClasses,
        "group-data-separate-controls/composer-surface:rounded-3xl group-data-separate-controls/composer-surface:bg-(--chat-composer-surface) group-data-separate-controls/composer-surface:shadow-composer group-data-separate-controls/composer-surface:after:block dark:group-data-separate-controls/composer-surface:shadow-composer-dark",
        "after:z-20 after:hidden group-has-data-[composer-banner-surface=attached]/composer-surface:after:block",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:bg-(--chat-composer-surface)",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-composer dark:group-has-data-[composer-banner-surface=attached]/composer-surface:shadow-none",
        "group-has-data-[composer-banner-surface=attached]/composer-surface:**:data-[chat-composer-mobile-collapsed=true]:min-h-[calc(1rem+1px)]",
        className,
      )}
      {...props}
    />
  );
}

/** Where the thread runs (environment, project, worktree, branch); the composer's backdrop hides the timeline behind it. */
function ContextStrip({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="composer-context-strip"
      className={cn(
        "group/composer-context relative flex items-center gap-2 overflow-x-clip text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export const ComposerSurface = { Shell, Host, Main, ContextStrip };
