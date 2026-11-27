import {
  createContext,
  use,
  useId,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const GroupedRows = createContext(false);

/** Groups may span virtualized timeline items. Each part owns its trailing space. */
export function WorkLogBlock({
  layout = "standalone",
  continues = false,
  children,
}: {
  layout?: "standalone" | "group-header" | "group-content";
  continues?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={
        continues || layout === "group-header"
          ? "pb-0"
          : layout === "group-content"
            ? "pb-1"
            : "pb-2"
      }
    >
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

/** A collapsed tool group: a quiet pill that discloses its steps. The timestamp sits outside the pill
 * so revealing it on hover never resizes the pill. */
export function WorkLogCapsule({
  icon,
  label,
  trailing,
  expanded,
  ...buttonProps
}: Omit<RowContent, "wrapLabel"> & { expanded: boolean } & Omit<
    ComponentProps<"button">,
    "className" | "style" | "children" | "aria-expanded"
  >) {
  return (
    <div className="group/timeline-row relative flex min-h-6 w-full min-w-0 items-center gap-2 py-0.5">
      <button
        {...buttonProps}
        type="button"
        aria-expanded={expanded}
        className="inline-flex h-6 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-full ps-0.5 pe-2 text-xs text-muted-foreground inset-ring inset-ring-border transition-colors select-none hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
      >
        {icon ? (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-3 shrink-0 opacity-70 transition-transform duration-200 motion-reduce:transition-none",
            !expanded && "-rotate-90",
          )}
        />
      </button>
      {trailing}
    </div>
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
          ? "ms-7 flex max-h-96 flex-col gap-3 overflow-auto px-0.5 py-1 select-text"
          : kind === "panel"
            ? "mt-0.5 mb-1.5 pb-2"
            : "mt-1",
      )}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
