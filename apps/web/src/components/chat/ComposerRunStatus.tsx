import type { EnvironmentId } from "@s1tools/contracts";
import { useGT } from "gt-react";

import { tickTextContent } from "~/lib/tickTextContent";
import { Spinner } from "../ui/spinner";
import { formatWorkingTimerNow } from "./TimelineWorkGroupRows.logic";

/** One line above the composer while a run is live; approvals, questions and banners take its place. */
export function ComposerRunStatus(props: {
  readonly label: string;
  readonly startedAt: string | null;
  readonly environmentId: EnvironmentId;
  /** Only when Stop can act and the user bound a key to it. */
  readonly interruptShortcutLabel: string | null;
  readonly tasks: { readonly done: number; readonly total: number } | null;
}) {
  const gt = useGT();
  const { startedAt, environmentId } = props;
  return (
    <div
      data-composer-run-status
      className={
        "surface-glass flex h-7 min-w-0 items-center gap-2 px-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums " +
        "group-has-[[data-composer-banner-stack]]/composer-stack:hidden group-has-[[data-chat-composer-top-drawer]]/composer-stack:hidden group-has-[[data-child-thread-approvals]]/composer-stack:hidden"
      }
    >
      <Spinner size="xs" aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 truncate font-medium text-foreground/80">{props.label}</span>
      {startedAt !== null || props.interruptShortcutLabel !== null ? (
        <span className="shrink-0 text-muted-foreground/70">
          {startedAt !== null ? (
            <span
              ref={tickTextContent(() => formatWorkingTimerNow(startedAt, environmentId), true)}
            />
          ) : null}
          {startedAt !== null && props.interruptShortcutLabel !== null ? " · " : null}
          {props.interruptShortcutLabel !== null
            ? gt("{shortcut} to interrupt", { shortcut: props.interruptShortcutLabel })
            : null}
        </span>
      ) : null}
      {props.tasks !== null ? (
        <span className="ms-auto shrink-0 text-muted-foreground/70">
          {gt("Tasks {done}/{total}", { done: props.tasks.done, total: props.tasks.total })}
        </span>
      ) : null}
    </div>
  );
}
