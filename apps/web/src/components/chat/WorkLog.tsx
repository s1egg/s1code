import {
  createContext,
  use,
  useId,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const GroupedRows = createContext(false);
const InStepDetail = createContext(false);

/** Groups may span virtualized timeline items. Each part owns its trailing space. */
export function WorkLogBlock({
  layout = "standalone",
  continues = false,
  children,
}: {
  layout?: "standalone" | "group-content";
  continues?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div className={continues ? "pb-0" : layout === "group-content" ? "pb-1" : "pb-2"}>
      {children}
    </div>
  );
}

export function WorkLogList({ children }: { children: ReactNode }) {
  return (
    <GroupedRows value>
      <div className="flex min-w-0 flex-col">{children}</div>
    </GroupedRows>
  );
}

type RowContent = {
  icon?: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  wrapLabel?: boolean;
};

const focusRingClassName =
  "rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70";

type LineProps = Omit<ComponentProps<"div">, "className" | "style" | "children">;

function WorkLogLine({ icon, label, trailing, wrapLabel, ...lineProps }: RowContent & LineProps) {
  return (
    <div
      {...lineProps}
      className={cn(
        "flex min-h-6 min-w-0 gap-1.5 text-xs leading-relaxed select-none [&_*]:select-none",
        wrapLabel ? "items-start" : "items-center",
        lineProps.role === "button" && focusRingClassName,
      )}
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        {icon ? (
          <span className="relative w-6 shrink-0 leading-0">
            <span className="inline-block size-6 overflow-hidden align-[calc(0.5cap_-_0.75rem)]">
              <span className="flex size-full items-center justify-center">{icon}</span>
            </span>
          </span>
        ) : null}
        <div
          className={cn(
            "min-w-0 flex-1 text-secondary-label",
            !wrapLabel && "truncate [&_*]:whitespace-nowrap",
          )}
        >
          {label}
        </div>
      </div>
      {trailing}
    </div>
  );
}

function useRowClassName(interactive: boolean, focusable = interactive) {
  const grouped = use(GroupedRows);
  return cn(
    "group/timeline-row relative w-full min-w-0 rounded-md px-0.5 text-left transition-colors",
    grouped ? "py-0" : "py-0.5",
    interactive && "cursor-pointer",
    focusable && focusRingClassName,
  );
}

type RowProps = Omit<ComponentProps<"div">, "className" | "style"> & {
  toggle?: LineProps | undefined;
};

/**
 * Div disclosure permits selectable detail and nested actions. `toggle` goes on
 * the header line only: assistive tech hides a button's children.
 */
export function WorkLogRow({
  icon,
  label,
  trailing,
  wrapLabel = false,
  toggle,
  children,
  ...rowProps
}: RowContent & RowProps) {
  const className = useRowClassName(rowProps.onClick !== undefined, false);
  const detailsId = useId();
  return (
    <div {...rowProps} className={className}>
      <WorkLogLine
        aria-controls={toggle ? detailsId : undefined}
        {...toggle}
        icon={icon}
        label={label}
        trailing={trailing}
        wrapLabel={wrapLabel}
      />
      {toggle ? <div id={detailsId}>{children}</div> : children}
    </div>
  );
}

/**
 * A plain tool or reasoning step: icon, verb, target, and result on one quiet grid line. Its detail
 * hangs off a hairline below. Like `WorkLogRow`, `toggle` goes on the line, not the whole row.
 */
export function WorkLogStepRow({
  icon,
  verb,
  target,
  result,
  describeResult = false,
  expandable,
  expanded,
  active = false,
  enterDelayMs,
  toggle,
  children,
  ...rowProps
}: {
  icon: ReactNode;
  verb: ReactNode;
  target: ReactNode;
  result?: ReactNode;
  /** The toggle's label replaces the line's text, so a static result is read as its description. */
  describeResult?: boolean;
  expandable: boolean;
  expanded: boolean;
  active?: boolean;
  enterDelayMs?: number | undefined;
  toggle?: LineProps | undefined;
} & Omit<ComponentProps<"div">, "className" | "style">) {
  const detailsId = useId();
  const resultId = useId();
  const describedBy = toggle && describeResult && result ? resultId : undefined;
  return (
    <div
      {...rowProps}
      className={cn(
        "group/step relative w-full min-w-0 text-left",
        rowProps.onClick !== undefined && "cursor-pointer",
        enterDelayMs !== undefined && "trace-step-in",
      )}
      style={
        enterDelayMs === undefined
          ? undefined
          : ({ "--trace-step-delay": `${enterDelayMs}ms` } as CSSProperties)
      }
    >
      <div
        aria-controls={toggle ? detailsId : undefined}
        aria-describedby={describedBy}
        {...toggle}
        className={cn(
          "grid h-5.5 min-w-0 grid-cols-[0.8125rem_3.25rem_minmax(0,1fr)_auto_0.75rem] items-center gap-x-2 text-2xs select-none transition-colors [&_*]:select-none",
          active ? "text-foreground/80" : "text-muted-foreground",
          "hover:text-foreground/85",
          toggle && focusRingClassName,
        )}
      >
        <span className="flex size-3.25 items-center justify-center">{icon}</span>
        {verb === null ? null : <span className="truncate">{verb}</span>}
        <span
          className={cn("min-w-0 truncate [&_*]:whitespace-nowrap", verb === null && "col-span-2")}
        >
          {target}
        </span>
        <span id={resultId} className="col-start-4 whitespace-nowrap text-end tabular-nums">
          {result}
        </span>
        <span className="col-start-5 flex justify-center">
          {expandable ? (
            <ChevronRightIcon
              aria-hidden
              className={cn(
                "size-3 shrink-0 opacity-0 transition-[transform,opacity] duration-200 group-hover/step:opacity-70 group-focus-within/step:opacity-70",
                expanded && "rotate-90 opacity-70",
              )}
            />
          ) : null}
        </span>
      </div>
      <div
        id={toggle ? detailsId : undefined}
        className="ms-1.75 mt-0.5 mb-1.5 cursor-auto border-s border-border/70 ps-3.75 empty:hidden"
      >
        <InStepDetail value>{children}</InStepDetail>
      </div>
    </div>
  );
}

const LIVE_EDGE_PX = 4;

export function WorkLogDetails({
  children,
  kind = "text",
  followLive = false,
}: {
  children: ReactNode;
  kind?: "text" | "panel" | "media";

  followLive?: boolean;
}) {
  const inStep = use(InStepDetail);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const atLiveEdgeRef = useRef(true);
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- pins the scroller's scrollTop to the bottom after each commit while following live output
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (followLive && atLiveEdgeRef.current && scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  });
  return (
    <div
      ref={scrollerRef}
      onScroll={(event) => {
        const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
        atLiveEdgeRef.current = scrollHeight - scrollTop - clientHeight <= LIVE_EDGE_PX;
      }}
      className={cn(
        "cursor-auto",
        kind === "text"
          ? cn(
              "flex max-h-96 flex-col gap-3 overflow-auto px-0.5 py-1 select-text",
              !inStep && "ms-7",
            )
          : kind === "panel"
            ? inStep
              ? "py-0.5"
              : "mt-0.5 mb-1.5 pb-2"
            : inStep
              ? "py-0.5"
              : "mt-1",
      )}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
