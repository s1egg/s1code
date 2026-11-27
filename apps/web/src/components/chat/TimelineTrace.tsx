import { ChevronDownIcon } from "lucide-react";
import { useGT, useMessages } from "gt-react";
import { toServerClock } from "@s1tools/client-runtime/clock";
import { formatDuration } from "@s1tools/shared/orchestrationTimingCopy";
import type { RunId } from "@s1tools/contracts";
import {
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "~/lib/utils";
import { tickTextContent } from "~/lib/tickTextContent";
import { observeVisibleAnimation } from "~/lib/visibleAnimation";
import { formatCompactDiffCount } from "./DiffStatLabel";
import { TimelineRowCtx } from "./timelineRowContext";
import { failedToolIconClassName, ToolActivityIconView } from "./TimelineToolActivityIcon";
import { type WorkStepChip, type WorkStepResult } from "./TimelineWorkEntryRow.logic";
import {
  formatTurnClock,
  formatWorkingTimerNow,
  advanceIslandHold,
  MIN_SHOW_MS,
  showIslandLook,
  THINK_SETTLE_MS,
  type IslandHold,
} from "./TimelineWorkGroupRows.logic";

const SPRING = "cubic-bezier(.3,1.35,.5,1)";
const EXPAND_STAGGER_WINDOW_MS = 400;
// About as many 22px rows as the expanded list shows before it scrolls.
const EXPAND_STAGGER_MAX_INDEX = 13;
// The finishing island's beats, from the mockup: absorb the film, then settle into its summary.
const ABSORB_AT_MS = 550;
const SETTLE_AT_MS = 1_250;

function motionAllowed() {
  return (
    typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

let foldExpandIntent: { readonly runId: RunId; readonly at: number } | null = null;

/** Marks the fold the user is opening, so the rows it reveals stagger in once. */
export function noteTurnFoldExpanding(runId: RunId) {
  foldExpandIntent = { runId, at: performance.now() };
}

/** When the user just opened this fold, or null once its rows should mount without a stagger. */
export function readTurnFoldExpandIntent(runId: RunId | undefined): number | null {
  const intent = foldExpandIntent;
  return runId !== undefined &&
    intent?.runId === runId &&
    performance.now() - intent.at <= EXPAND_STAGGER_WINDOW_MS &&
    motionAllowed()
    ? intent.at
    : null;
}

/** Delay for a revealed row's one-shot entrance, or undefined when it mounts without one. */
export function stepEnterDelay(enterStartedAt: number | null | undefined, index: number) {
  return enterStartedAt != null &&
    index <= EXPAND_STAGGER_MAX_INDEX &&
    performance.now() - enterStartedAt <= EXPAND_STAGGER_WINDOW_MS
    ? Math.min(index, 10) * 28
    : undefined;
}

function morphSize(
  element: HTMLElement,
  from: { readonly width: number; readonly height?: number },
): Animation | null {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (!motionAllowed() || (from.width === width && (from.height ?? height) === height)) {
    return null;
  }
  return element.animate(
    [
      { width: `${from.width}px`, height: `${from.height ?? height}px` },
      { width: `${width}px`, height: `${height}px` },
    ],
    { duration: 500, easing: SPRING },
  );
}

// Rows render beyond the chat's scroller (overscan, a drawer over it), so the window is no guide.
function outOfView(element: HTMLElement) {
  let viewport: { top: number; bottom: number } = { top: 0, bottom: window.innerHeight };
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") {
      viewport = node.getBoundingClientRect();
      break;
    }
  }
  const { top, bottom } = element.getBoundingClientRect();
  return bottom <= viewport.top || top >= viewport.bottom;
}

function sameLook(a: TurnIslandLook | null, b: TurnIslandLook | null) {
  return (
    a?.key === b?.key &&
    a?.label === b?.label &&
    a?.tone === b?.tone &&
    a?.equalizer === b?.equalizer &&
    a?.clockStartedAt === b?.clockStartedAt
  );
}

type TraceOrbTone = "live" | "neutral" | "quiet" | "quiet-failed";

function TraceOrb({ tone, children }: { tone: TraceOrbTone; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full",
        tone === "quiet" || tone === "quiet-failed" ? "size-4.5" : "size-5",
        tone === "live" && "bg-linear-140 from-primary/75 to-primary/50 text-primary-foreground",
        (tone === "neutral" || tone === "quiet") && "bg-muted text-muted-foreground",
        tone === "quiet-failed" && "bg-tool-error-icon/12 text-tool-error-icon/70",
      )}
    >
      {children}
    </span>
  );
}

function TraceCheckGlyph({ draw = false }: { draw?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-3", draw && "trace-check-draw")}
      aria-hidden
    >
      <path d="M5.5 12.5l4.2 4.2 8.8-9.2" pathLength="1" />
    </svg>
  );
}

function TraceStopGlyph() {
  return <span aria-hidden className="size-1.5 rounded-xs bg-current" />;
}

function TraceFailGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      className="size-2.5"
      aria-hidden
    >
      <path d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

const islandFocusClassName =
  "rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70";

function TraceChevron({ expanded }: { expanded: boolean }) {
  return (
    <ChevronDownIcon
      aria-hidden
      strokeWidth={2.5}
      className={cn(
        "size-2.5 shrink-0 text-muted-foreground/60 transition-transform duration-300 motion-reduce:transition-none",
        !expanded && "-rotate-90",
      )}
    />
  );
}

function TraceChip({
  chip,
  className,
  style,
}: {
  chip: WorkStepChip;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  const text = chip.text;
  return (
    <span
      data-trace-chip
      className={cn(
        "inline-flex h-5.5 shrink-0 items-center gap-1 rounded-full bg-muted/70 ps-1.5 pe-2 text-2xs text-muted-foreground tabular-nums whitespace-nowrap",
        chip.failed && "text-tool-error-icon/70",
        className,
      )}
      style={style}
    >
      <ToolActivityIconView
        icon={chip.failed ? undefined : chip.icon}
        fallbackName={chip.iconName}
        className={cn(
          "block size-2.75 shrink-0 stroke-2 opacity-80",
          chip.failed && failedToolIconClassName,
        )}
        muted={false}
      />
      {text?.kind === "count" ? text.value : null}
      {text?.kind === "diff" ? <TraceDiffText {...text} /> : null}
      {text?.kind === "exit" ? text.code : null}
      {text?.kind === "ok" ? "✓" : null}
    </span>
  );
}

// Chips stay monochrome like the rest of the film; colored counts live in the expanded rows.
function TraceDiffText({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="inline-flex gap-1 font-mono">
      {additions > 0 ? <span>{`+${formatCompactDiffCount(additions)}`}</span> : null}
      {deletions > 0 ? <span>{`−${formatCompactDiffCount(deletions)}`}</span> : null}
    </span>
  );
}

function TraceEqualizer() {
  return (
    <span
      aria-hidden
      ref={observeVisibleAnimation}
      className="inline-flex h-2.75 shrink-0 items-end gap-0.5"
    >
      <i className="trace-eq-bar h-full w-0.5 rounded-full bg-primary/75" />
      <i className="trace-eq-bar h-full w-0.5 rounded-full bg-primary/75 [--trace-eq-delay:-350ms]" />
      <i className="trace-eq-bar h-full w-0.5 rounded-full bg-primary/75 [--trace-eq-delay:-700ms]" />
    </span>
  );
}

function StepTimer({ startedAt, className }: { startedAt: string; className?: string }) {
  const { activeThreadEnvironmentId } = use(TimelineRowCtx);
  return (
    <span
      aria-hidden
      ref={tickTextContent(() => formatWorkingTimerNow(startedAt, activeThreadEnvironmentId), true)}
      className={cn("tabular-nums", className)}
    />
  );
}

/** The whole turn's clock; `frozen` stops it at its current time while the island settles. */
function TurnClock({ startedAt, frozen }: { startedAt: string; frozen: boolean }) {
  const { activeThreadEnvironmentId } = use(TimelineRowCtx);
  const frozenAtRef = useRef<number | null>(null);
  return (
    <span
      aria-hidden
      ref={tickTextContent((nowMs) => {
        const now = toServerClock(activeThreadEnvironmentId, nowMs);
        frozenAtRef.current = frozen ? (frozenAtRef.current ?? now) : null;
        return formatTurnClock((frozenAtRef.current ?? now) - Date.parse(startedAt));
      }, !frozen)}
      className="font-mono text-2xs text-muted-foreground/70 tabular-nums"
    />
  );
}

export function StepResultLabel({ result }: { result: WorkStepResult }) {
  const gt = useGT();
  const m = useMessages();
  switch (result.kind) {
    case "diff":
      return (
        <span
          role="group"
          aria-label={gt("{additions} additions, {deletions} deletions", {
            additions: result.additions,
            deletions: result.deletions,
          })}
          className="inline-flex gap-1 font-mono opacity-70"
        >
          {result.additions > 0 || result.deletions === 0 ? (
            <span aria-hidden className="text-diff-addition-foreground">
              {`+${formatCompactDiffCount(result.additions)}`}
            </span>
          ) : null}
          {result.deletions > 0 ? (
            <span aria-hidden className="text-diff-deletion-foreground">
              {`−${formatCompactDiffCount(result.deletions)}`}
            </span>
          ) : null}
        </span>
      );
    case "count":
      return result.noun === "file"
        ? gt("{count, plural, one {{count} file} other {{count} files}}", { count: result.value })
        : result.noun === "hit"
          ? gt("{count, plural, one {{count} hit} other {{count} hits}}", { count: result.value })
          : gt("{count, plural, one {{count} result} other {{count} results}}", {
              count: result.value,
            });
    case "failed":
      return (
        <span className="text-tool-error-icon/60">
          {gt("Failed", { $context: "result of a tool call step" })}
        </span>
      );
    case "declined":
      return gt("Declined", { $context: "result of a tool call step" });
    case "stopped":
      return gt("Stopped", { $context: "result of a tool call step" });
    case "exit":
      return (
        <span className="text-tool-error-icon/60">
          {gt("Exit {code}", { code: result.code, $context: "a command's nonzero exit code" })}
        </span>
      );
    case "duration":
      return formatDuration(result.ms, m);
    case "live":
      return <StepTimer startedAt={result.startedAt} />;
    case "progress":
      return `${result.done}/${result.total}`;
  }
}

/** What the island shows while its turn runs. */
export interface TurnIslandLook {
  /** The activity state, such as "tool:explore" or "thinking"; a new one replays the entrance. */
  readonly key: string;
  /** How long the shown state holds before this one replaces it. */
  readonly hold: IslandHold;
  readonly label: string;
  readonly orbIcon: ReactNode;
  readonly tone: "live" | "neutral";
  readonly equalizer: boolean;
  readonly clockStartedAt: string | null;
}

/**
 * Holds each shown state long enough to read, so quick thoughts between tool calls do not flip the
 * label. Fields of the shown state, such as a subagent count, update in place.
 */
function useHeldIslandLook(look: TurnIslandLook | null, live: boolean): TurnIslandLook | null {
  const [hold, setHold] = useState(() => (live && look ? showIslandLook(look) : null));
  if (live && look) {
    const next = advanceIslandHold(hold, look, sameLook);
    if (next !== hold) setHold(next);
  } else if (hold !== null) {
    // A finished turn drops its pending switch and timers; going live again starts a fresh hold.
    setHold(null);
  }
  const shownKey = hold?.shown.key ?? null;
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- times the shown state's minimum hold
  useEffect(() => {
    if (shownKey === null) return;
    const timer = setTimeout(
      () =>
        setHold((current) =>
          current?.shown.key === shownKey ? { ...current, minShown: true } : current,
        ),
      MIN_SHOW_MS,
    );
    return () => clearTimeout(timer);
  }, [shownKey]);
  const settlingKey =
    hold && hold.wanted.hold === "settle" && hold.wanted.key !== hold.shown.key
      ? hold.wanted.key
      : null;
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- times how long Thinking has been wanted before it may show
  useEffect(() => {
    if (settlingKey === null) return;
    const timer = setTimeout(
      () =>
        setHold((current) =>
          current?.wanted.key === settlingKey ? { ...current, settled: true } : current,
        ),
      THINK_SETTLE_MS,
    );
    return () => clearTimeout(timer);
  }, [settlingKey]);
  if (!hold || !look) return look;
  return look.key === hold.shown.key ? look : hold.shown;
}

type IslandPhase = "live" | "finishing" | "absorbing" | "settled" | "done";

/**
 * A turn's island: its live header while the turn runs, settling in place into the turn's summary.
 * One instance carries both states, so the same pill can absorb its film and morph into the summary.
 */
export function TurnIsland({
  live,
  look,
  chips,
  hiddenChipCount,
  summary,
  summaryGlyph,
  expanded,
  onToggle,
  ariaLabel,
  busy,
  caption,
  trailing,
}: {
  live: boolean;
  /** What the island shows while its turn runs; null once the turn ended. */
  look: TurnIslandLook | null;
  /** The newest finished steps the film shows; `hiddenChipCount` older ones fold into "+N". */
  chips: ReadonlyArray<WorkStepChip>;
  hiddenChipCount: number;
  summary: ReactNode;
  summaryGlyph: "check" | "stop" | "fail";
  expanded: boolean;
  /** Unset while the fold hides nothing. */
  onToggle: (() => void) | undefined;
  /** The finished island's accessible name; a running one is named by its shown state. */
  ariaLabel: string;
  busy?: boolean | undefined;
  caption: ReactNode;
  trailing: ReactNode;
}) {
  const [phase, setPhase] = useState<IslandPhase>(live ? "live" : "done");
  const [wasLive, setWasLive] = useState(live);
  const [finishRun, setFinishRun] = useState(0);
  if (wasLive !== live) {
    setWasLive(live);
    const animates =
      !live && phase === "live" && motionAllowed() && document.visibilityState === "visible";
    setPhase(live ? "live" : animates ? "finishing" : "done");
    // Each finish owns its beats; one that skips them must not re-arm an earlier finish's.
    setFinishRun(animates ? finishRun + 1 : 0);
  }
  const heldLook = useHeldIslandLook(look, live);
  // The finish keeps the look the island showed when its turn ended; nothing after relabels it.
  const [lastLiveLook, setLastLiveLook] = useState(heldLook);
  if (live && heldLook && !sameLook(heldLook, lastLiveLook)) setLastLiveLook(heldLook);
  const shownLook = live ? heldLook : lastLiveLook;
  const [entrance, setEntrance] = useState({ key: heldLook?.key ?? "", changed: false });
  if (live && heldLook && entrance.key !== heldLook.key) {
    setEntrance({ key: heldLook.key, changed: true });
  }
  const [initialChipIds] = useState(() => new Set(chips.map((chip) => chip.id)));
  const pillRef = useRef<HTMLSpanElement>(null);
  const morphRef = useRef({ key: "", width: 0 });
  const settleFromRef = useRef<{ width: number; height: number } | null>(null);

  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- morphs the pill between the measured widths of consecutive states
  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill || !live || morphRef.current.key === entrance.key) return;
    const previous = morphRef.current.width;
    morphRef.current = { key: entrance.key, width: pill.offsetWidth };
    if (previous > 0) morphSize(pill, { width: previous });
  }, [live, entrance.key]);
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- chains the finishing beats on timers, which a throttled tab cannot strand the way animationend can
  useLayoutEffect(() => {
    if (finishRun === 0 || live) return;
    const pill = pillRef.current;
    const skip = () => setPhase((current) => (current === "live" ? current : "done"));
    if (!pill || outOfView(pill)) {
      skip();
      return;
    }
    const absorb = setTimeout(() => setPhase("absorbing"), ABSORB_AT_MS);
    const settle = setTimeout(() => {
      settleFromRef.current = { width: pill.offsetWidth, height: pill.offsetHeight };
      setPhase("settled");
    }, SETTLE_AT_MS);
    const settleIfHidden = () => {
      if (document.visibilityState !== "visible") {
        clearTimeout(absorb);
        clearTimeout(settle);
        skip();
      }
    };
    document.addEventListener("visibilitychange", settleIfHidden);
    return () => {
      clearTimeout(absorb);
      clearTimeout(settle);
      document.removeEventListener("visibilitychange", settleIfHidden);
    };
  }, [finishRun, live]);
  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- springs the pill from the live island's measured size into its summary with WAAPI
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const from = settleFromRef.current;
    if (phase !== "settled" || !pill || !from) return;
    settleFromRef.current = null;
    morphSize(pill, from);
  }, [phase]);

  const showsLive = phase === "live" || phase === "finishing" || phase === "absorbing";
  const settling = phase === "settled";
  const animateEntrance = entrance.changed && phase === "live";
  const showsFilm = showsLive && (chips.length > 0 || hiddenChipCount > 0);
  const absorbing = phase === "absorbing";
  const filmOffset = hiddenChipCount > 0 ? 1 : 0;

  return (
    <div className="@container/trace min-w-0 py-0.5">
      <div className="flex min-h-7 w-full min-w-0 items-center gap-2">
        {/* The toggle overlays the line instead of wrapping it, so the pill keeps its node while
            it morphs. */}
        <div className="group/island relative flex min-w-0 max-w-full items-center gap-1.75">
          <span
            ref={pillRef}
            aria-hidden
            data-trace-island
            data-island-state={showsLive ? "live" : "done"}
            className={cn(
              "relative inline-flex min-w-0 max-w-full items-center overflow-hidden whitespace-nowrap rounded-full text-xs inset-ring inset-ring-border",
              showsLive
                ? "h-7 gap-2 bg-muted/60 ps-1 pe-3 text-foreground/85 shadow-trace-island dark:shadow-trace-island-dark"
                : "h-6 gap-1.75 ps-0.75 pe-2.5 text-muted-foreground tabular-nums transition-colors",
              !showsLive &&
                onToggle &&
                "group-hover/island:bg-muted/40 group-hover/island:text-foreground/85",
              settling && "trace-pulse",
            )}
          >
            {showsLive && shownLook ? (
              <>
                <TraceOrb tone={shownLook.tone}>
                  <span
                    key={entrance.key}
                    className={cn("flex", animateEntrance && "trace-orb-pop")}
                  >
                    {shownLook.orbIcon}
                  </span>
                </TraceOrb>
                <span
                  key={entrance.key}
                  className={cn("min-w-0 truncate", animateEntrance && "trace-label-in")}
                >
                  {shownLook.label}
                </span>
                {shownLook.equalizer ? <TraceEqualizer /> : null}
                {shownLook.clockStartedAt ? (
                  <TurnClock startedAt={shownLook.clockStartedAt} frozen={phase !== "live"} />
                ) : null}
                {animateEntrance ? (
                  <span
                    key={`sheen:${entrance.key}`}
                    aria-hidden
                    className="trace-sheen pointer-events-none absolute inset-0"
                  />
                ) : null}
              </>
            ) : (
              <>
                <TraceOrb tone={summaryGlyph === "fail" ? "quiet-failed" : "quiet"}>
                  {summaryGlyph === "stop" ? (
                    <TraceStopGlyph />
                  ) : summaryGlyph === "fail" ? (
                    <TraceFailGlyph />
                  ) : (
                    <TraceCheckGlyph draw={settling} />
                  )}
                </TraceOrb>
                <span className={cn("min-w-0 truncate", settling && "trace-label-in")}>
                  {summary}
                </span>
              </>
            )}
          </span>
          {showsFilm ? (
            <span
              aria-hidden
              className="hidden shrink-0 items-center gap-1.25 @min-[30rem]/trace:flex"
            >
              {hiddenChipCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex h-5.5 items-center rounded-full bg-muted/70 px-2 text-2xs text-muted-foreground tabular-nums",
                    absorbing && "trace-chip-absorb",
                  )}
                  style={{ "--trace-k": 0 } as CSSProperties}
                >
                  {`+${hiddenChipCount}`}
                </span>
              ) : null}
              {chips.map((chip, index) => (
                <TraceChip
                  key={chip.id}
                  chip={chip}
                  className={
                    absorbing
                      ? "trace-chip-absorb"
                      : initialChipIds.has(chip.id)
                        ? undefined
                        : "trace-chip-in"
                  }
                  style={{ "--trace-k": index + filmOffset } as CSSProperties}
                />
              ))}
            </span>
          ) : null}
          {onToggle ? <TraceChevron expanded={expanded} /> : null}
          {onToggle ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={live && shownLook ? shownLook.label : ariaLabel}
              aria-busy={busy}
              data-scroll-anchor-ignore
              onClick={onToggle}
              className={cn("absolute inset-0 cursor-pointer", islandFocusClassName)}
            />
          ) : (
            <span className="sr-only">{live && shownLook ? shownLook.label : ariaLabel}</span>
          )}
        </div>
        {trailing}
      </div>
      {caption && showsLive && !expanded ? (
        <div className="line-clamp-2 ps-7.5 pt-0.5 text-2xs leading-snug text-muted-foreground">
          {caption}
        </div>
      ) : null}
    </div>
  );
}
