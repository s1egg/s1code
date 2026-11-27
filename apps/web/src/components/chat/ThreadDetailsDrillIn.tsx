import { useGT } from "gt-react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { ThreadDetailsControl } from "./ThreadDetailsControl";
import type { ThreadDetailsDrillInId } from "./threadDetailsStore";
import { THREAD_DETAILS_PANEL_LABEL_CLASS } from "./threadDetailsPanelStyles";

/** A "Label ›   detail" row that opens a fuller view, inside the sidebar or elsewhere. */
export function ThreadDetailsNavRow({
  label,
  detail,
  drillIn,
  ...props
}: Omit<ComponentProps<typeof ThreadDetailsControl>, "children" | "part"> & {
  label: string;
  /** Right-aligned summary, such as a percentage. */
  detail?: ReactNode;
  /** Marks the row so focus returns to it when its drill-in closes. */
  drillIn?: ThreadDetailsDrillInId;
}) {
  return (
    <ThreadDetailsControl
      variant="ghost"
      size="sm"
      part="row"
      {...props}
      {...(drillIn ? { "data-thread-details-drill-in": drillIn } : {})}
    >
      <span className={cn("min-w-0 truncate", THREAD_DETAILS_PANEL_LABEL_CLASS)}>{label}</span>
      <ChevronRightIcon
        aria-hidden
        className="-ms-1.5 size-3.5 text-muted-foreground rtl:rotate-180"
      />
      {detail !== undefined ? (
        <span className="ms-auto flex shrink-0 items-center gap-2 text-xs font-normal text-muted-foreground tabular-nums">
          {detail}
        </span>
      ) : null}
    </ThreadDetailsControl>
  );
}

/** A drill-in replaces the sidebar's sections until its back button or Escape returns. */
export function ThreadDetailsDrillInView({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  const gt = useGT();
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-thread-details-drill-in-view className="flex flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 px-2">
        <ThreadDetailsControl
          variant="ghost"
          part="icon"
          aria-label={gt("Back")}
          data-thread-details-back
          onClick={onBack}
        >
          <ChevronLeftIcon aria-hidden className="size-4 rtl:rotate-180" />
        </ThreadDetailsControl>
        <h3 id={titleId} className="min-w-0 truncate text-sm font-medium text-foreground">
          {title}
        </h3>
      </div>
      <div className="px-4 pb-3">{children}</div>
    </section>
  );
}
