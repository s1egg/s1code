import { WorkLogList } from "./WorkLog";
import type { RunId, WorktreeSetupSnapshot } from "@s1tools/contracts";
import {
  resolveViewedImageAsset,
  workEntriesViewedImagePaths,
} from "@s1tools/client-runtime/work-log/presentation";
import { resolveWorkGroupScrollAnchor } from "@s1tools/client-runtime/work-log/scroll-anchor";
import { useAssetUrls } from "~/assets/assetUrls";
import { observeResize } from "~/lib/observeResize";
import { T, useGT, useMessages } from "gt-react";
import { memo, use, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { workEntryDisplayIndicatesToolFailure } from "../../session-logic";
import ChatMarkdown from "../ChatMarkdown";
import { assetMediaActionsSource } from "./ChatMarkdownMedia";
import {
  AlignLeftIcon,
  BrainIcon,
  GitBranchIcon,
  HandIcon,
  MessageCircleQuestionIcon,
  Minimize2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { getVirtualizedScrollFadeClassName } from "../ui/scroll-area";
import {
  liveWorkEntryLabel,
  resolveWorkGroupScrollIndex,
  shouldFollowWorkGroupAppend,
  workEntryIsVisibleInGroup,
  type MessagesTimelineRow,
  type TurnFoldLive,
  type TurnFoldPosition,
} from "./MessagesTimeline.logic";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Spinner } from "../ui/spinner";
import { WorktreeSetupCard } from "./WorktreeSetupCard";
import { cn } from "~/lib/utils";
import {
  TimelineRowCtx,
  TimelineRowActivityCtx,
  WorkGroupViewCtx,
  type WorkGroupViewedImage,
  type TimelineWorkEntry,
  type TimelineRow,
} from "./timelineRowContext";
import { ProviderStartingIcon } from "./ProviderStartingIcon";
import { ToolActivityIconView } from "./TimelineToolActivityIcon";
import {
  useThreadReadTarget,
  threadReadLabel,
  ThreadReadLabel,
  SimpleWorkEntryRow,
} from "./TimelineWorkEntryRow";
import {
  captionSourceLine,
  thoughtPreviewMarkdown,
  workEntryIconName,
  workStepChip,
  workStepIslandTarget,
  workStepParts,
} from "./TimelineWorkEntryRow.logic";
import {
  readTurnFoldExpandIntent,
  StepVerbLabel,
  TurnIsland,
  type TurnIslandLook,
} from "./TimelineTrace";

export const WorkGroupSection = memo(function WorkGroupSection({
  anchorKey,
  groupedEntries,
  isExpandedToolGroup,
  fold,
}: {
  anchorKey: string;
  groupedEntries: Extract<MessagesTimelineRow, { kind: "work" }>["groupedEntries"];
  isExpandedToolGroup: boolean;
  fold?: TurnFoldPosition | undefined;
}) {
  const {
    workspaceRoot,
    routeThreadKey,
    onToggleWorkEntry,
    onWorkEntryContentReady,
    pendingApprovals,
  } = use(TimelineRowCtx);
  const gt = useGT();
  const [enterStartedAt] = useState(() => readTurnFoldExpandIntent(fold?.runId));
  const nonEmptyEntries = groupedEntries.filter((entry) => {
    const item = entry.projectedItem?.item;
    return (
      (item?.type === "approval_request" && pendingApprovals.has(item.requestId)) ||
      workEntryIsVisibleInGroup(entry, isExpandedToolGroup)
    );
  });

  if (nonEmptyEntries.length === 0) return null;
  if (isExpandedToolGroup) {
    return (
      <ExpandedWorkGroupEntries
        key={`${routeThreadKey}:${anchorKey}`}
        anchorKey={anchorKey}
        entries={nonEmptyEntries}
        groupedEntries={groupedEntries}
        workspaceRoot={workspaceRoot}
        enterStartedAt={enterStartedAt}
        staggerOffset={fold?.index ?? 0}
      />
    );
  }

  return (
    <section aria-label={gt("Activity")}>
      {nonEmptyEntries.map((workEntry, index) => (
        <SimpleWorkEntryRow
          key={workEntry.id}
          workEntry={workEntry}
          workspaceRoot={workspaceRoot}
          enterStartedAt={enterStartedAt}
          staggerIndex={fold === undefined ? undefined : fold.index + index}
          onToggleEntry={(collapsed) => onToggleWorkEntry(anchorKey, collapsed, workEntry.id)}
          onContentReady={() => onWorkEntryContentReady?.(anchorKey, workEntry.id)}
        />
      ))}
    </section>
  );
});

const compactWorkEntryHeight = 22;

// The thumbnail strip below the group is its own virtualized row, so the gallery an expanded
// entry opens is built from the same entries rather than from the strip's mounted images.
function useWorkGroupViewedImages(
  groupedEntries: ReadonlyArray<TimelineWorkEntry>,
): ReadonlyArray<WorkGroupViewedImage> {
  const { threadRef, workspaceRoot, activeThreadEnvironmentId } = use(TimelineRowCtx);
  const gt = useGT();
  const fallbackName = gt("image", { $context: "fallback name of an image without alt text" });
  const viewed = threadRef
    ? workEntriesViewedImagePaths(groupedEntries).flatMap((path) => {
        const asset = resolveViewedImageAsset(path, {
          threadId: threadRef.threadId,
          workspaceRoot,
        });
        return asset ? [{ path, asset }] : [];
      })
    : [];
  const environmentId = threadRef?.environmentId ?? activeThreadEnvironmentId;
  const urls = useAssetUrls(
    environmentId,
    viewed.map(({ asset }) => asset.resource),
  );
  return viewed.map(({ path, asset }, index) => {
    const url = urls[index];
    if (!url) return { path, item: null };
    const src = url + asset.srcFragment;
    const name = asset.alt.trim() || fallbackName;
    return {
      path,
      item: {
        src,
        name,
        actionsSource: assetMediaActionsSource({
          environmentId,
          resource: asset.resource,
          kind: "image",
          name: asset.alt || fallbackName,
          src,
          workspaceRoot,
        }),
      },
    };
  });
}

function ExpandedWorkGroupEntries({
  anchorKey,
  entries,
  groupedEntries,
  workspaceRoot,
  enterStartedAt,
  staggerOffset,
}: {
  anchorKey: string;
  entries: TimelineWorkEntry[];
  groupedEntries: ReadonlyArray<TimelineWorkEntry>;
  workspaceRoot: string | undefined;
  /** When the user opened the fold these steps belong to, so they stagger in once. */
  enterStartedAt: number | null;
  /** Rows the fold reveals above this list, so the stagger continues across them. */
  staggerOffset: number;
}) {
  const {
    workGroupViewState: viewState,
    onToggleWorkEntry,
    onWorkEntryContentReady,
  } = use(TimelineRowCtx);
  const gt = useGT();
  const [initialScrollIndex] = useState(() =>
    resolveWorkGroupScrollIndex(entries, viewState.scrollPositions.get(anchorKey)),
  );
  const [restoringPosition, setRestoringPosition] = useState(initialScrollIndex !== undefined);
  const listRef = useRef<LegendListRef>(null);
  const [expandedContentHeight, setExpandedContentHeight] = useState(0);
  const [fades, setFades] = useState({ top: false, bottom: false, viewportHeight: 0 });
  const [appendState, setAppendState] = useState({ entries, follow: false });
  // Capture the pre-change edge once per incoming array, before new layout
  // metrics arrive. Edge/viewport changes never turn a status update into a follow.
  if (appendState.entries !== entries) {
    setAppendState({
      entries,
      follow:
        fades.viewportHeight > 0 &&
        shouldFollowWorkGroupAppend(appendState.entries, entries, fades.bottom ? Infinity : 0),
    });
  }

  const viewedImages = useWorkGroupViewedImages(groupedEntries);
  const groupView = {
    state: viewState,
    enterStartedAt,
    viewedImages,
    onToggleEntry: (collapsed: boolean, entryId: string) =>
      onToggleWorkEntry(anchorKey, collapsed, entryId),
    onContentReady: (entryId: string) => onWorkEntryContentReady?.(anchorKey, entryId),
  };
  const updateScrollFades = () => {
    const element = listRef.current?.getScrollableNode();
    if (!element) return;
    const distanceFromEnd = element.scrollHeight - element.clientHeight - element.scrollTop;
    const viewportHeight = element.clientHeight;
    const top = element.scrollTop > 1;
    const bottom = distanceFromEnd > 1;
    setFades((previous) =>
      previous.top === top &&
      previous.bottom === bottom &&
      previous.viewportHeight === viewportHeight
        ? previous
        : { top, bottom, viewportHeight },
    );
  };

  const handleScroll = () => {
    const state = listRef.current?.getState();
    const position = state && resolveWorkGroupScrollAnchor(state);
    if (position) {
      viewState.scrollPositions.set(anchorKey, {
        entryId: position.rowId,
        offset: position.offsetWithinRow,
      });
    }
    updateScrollFades();
  };

  const handleLoad = () => {
    const list = listRef.current;
    const element = list?.getScrollableNode();
    if (initialScrollIndex && list && element) {
      // Bootstrap can report the restored target before the DOM has applied it.
      // Reconcile once at load, before releasing the measured anchor row.
      const offset = Math.max(
        0,
        Math.min(list.getState().scroll, element.scrollHeight - element.clientHeight),
      );
      if (Math.abs(element.scrollTop - offset) > 1) {
        void list.scrollToOffset({ offset, animated: false });
      }
    }
    setRestoringPosition(false);
  };

  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- observes the list scroller and its content with ResizeObserver to update scroll fades
  useLayoutEffect(() => {
    const element = listRef.current?.getScrollableNode();
    if (!element) return;
    updateScrollFades();
    const content = element.firstElementChild;
    return observeResize(content ? [element, content] : element, updateScrollFades);
  }, [updateScrollFades]);

  const renderEntry = ({ item, index }: { item: TimelineWorkEntry; index: number }) => (
    <SimpleWorkEntryRow
      key={item.id}
      workEntry={item}
      workspaceRoot={workspaceRoot}
      staggerIndex={staggerOffset + index}
    />
  );

  const updateExpandedContentHeight = () => {
    const state = listRef.current?.getState();
    let height = 0;
    for (const entryId of viewState.expandedEntries) {
      if (state?.indexByKey(entryId) === undefined) continue;
      height += Math.max(
        0,
        (state.sizes.get(entryId) ?? compactWorkEntryHeight) - compactWorkEntryHeight,
      );
    }
    setExpandedContentHeight(height);
  };

  // oxlint-disable-next-line s1code/no-unreasoned-state-sync -- reads expanded row sizes from LegendList's measured state after layout
  useLayoutEffect(updateExpandedContentHeight, [entries, updateExpandedContentHeight]);

  return (
    <WorkGroupViewCtx value={groupView}>
      <WorkLogList>
        <LegendList
          ref={listRef}
          data={entries}
          extraData={workspaceRoot}
          keyExtractor={workEntryKey}
          renderItem={renderEntry}
          estimatedItemSize={compactWorkEntryHeight}
          drawDistance={240}
          recycleItems
          {...(initialScrollIndex ? { initialScrollIndex } : {})}
          maintainScrollAtEnd={
            appendState.follow ? { animated: false, on: { dataChange: true } } : false
          }
          maintainScrollAtEndThreshold={1 / Math.max(1, fades.viewportHeight)}
          // Measure the restored row even when an intra-row offset puts its
          // estimated bounds outside the list's small bootstrap render window.
          {...(restoringPosition && initialScrollIndex
            ? { alwaysRender: { indices: [initialScrollIndex.index] } }
            : {})}
          maintainVisibleContentPosition
          onLoad={handleLoad}
          onScroll={handleScroll}
          onLayout={updateScrollFades}
          onItemSizeChanged={updateExpandedContentHeight}
          tabIndex={0}
          role="region"
          aria-label={gt("Tool calls")}
          data-tool-group-scroll
          style={{ maxHeight: `calc(min(28rem, 60dvh) + ${expandedContentHeight}px)` }}
          className={cn(
            "scrollbar-gutter-stable scroll-py-6 overflow-x-hidden ps-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70",
            getVirtualizedScrollFadeClassName(fades),
          )}
        />
      </WorkLogList>
    </WorkGroupViewCtx>
  );
}

const workEntryKey = (entry: TimelineWorkEntry) => entry.id;

function BackgroundWorktreeSetupChip({ snapshot }: { snapshot: WorktreeSetupSnapshot }) {
  const ctx = use(TimelineRowCtx);
  const gt = useGT();
  const terminalId = snapshot.setupScript?.terminalId ?? null;
  const openTerminal = ctx.onOpenWorktreeSetupTerminal;
  const onOpenTerminal = openTerminal && terminalId ? () => openTerminal(terminalId) : null;
  const scriptName = snapshot.setupScript?.name ?? gt("Setup script");
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost-muted"
            size="micro"
            className="ml-auto min-w-0 shrink-0"
            aria-label={gt(
              "Background setup is still running: {scriptName}. Show setup progress.",
              { scriptName },
            )}
          />
        }
      >
        <Spinner className="size-3 shrink-0" />
        <span className="truncate">
          <T>Background setup</T>
        </span>
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="end" width="lg" padding="compact">
        <WorktreeSetupCard
          snapshot={snapshot}
          embedded
          onCancel={null}
          onWorkLocally={null}
          onOpenTerminal={onOpenTerminal}
        />
      </PopoverPopup>
    </Popover>
  );
}

function useIslandLook(live: TurnFoldLive | undefined, runId: RunId): TurnIslandLook | null {
  const ctx = use(TimelineRowCtx);
  const gt = useGT();
  const m = useMessages();
  const activity = use(TimelineRowActivityCtx);
  const step = live?.activity === "step" ? (live.step ?? null) : null;
  const threadTarget = useThreadReadTarget(step, ctx.activeThreadEnvironmentId);
  if (!live) return null;
  const clockStartedAt = live.startedAt;
  const plain = (
    key: string,
    label: string,
    orbIcon: ReactNode,
    tone: TurnIslandLook["tone"] = "live",
    equalizer?: boolean,
  ): TurnIslandLook => ({
    stepKey: key,
    label,
    ariaLabel: label,
    orbIcon,
    tone,
    equalizer: equalizer ?? tone === "live",
    clockStartedAt,
  });

  // Only the starting run's island says so, never an older one still finishing.
  if (
    activity.providerStarting !== null &&
    (runId === activity.latestRunId || runId === "pending")
  ) {
    return plain(
      "starting",
      activity.providerStartingLabel === null ? gt("Starting…") : m(activity.providerStartingLabel),
      <ProviderStartingIcon
        environmentId={ctx.activeThreadEnvironmentId ?? null}
        instanceId={activity.providerStarting.instanceId}
        driver={activity.providerStarting.driver}
      />,
      "neutral",
      true,
    );
  }
  if (activity.isPreparingWorktree) {
    return plain(
      "worktree",
      gt("Setting up worktree…"),
      <GitBranchIcon aria-hidden className="size-3 stroke-2" />,
    );
  }
  if (live.activity === "compacting" || activity.isCompacting) {
    return plain(
      "compacting",
      gt("Compacting…"),
      <Minimize2Icon aria-hidden className="size-3 stroke-2" />,
    );
  }
  if (live.label) {
    return plain("subagents", live.label, <UsersIcon aria-hidden className="size-3 stroke-2" />);
  }
  if (live.activity === "approval") {
    return plain(
      "approval",
      gt("Waiting for approval"),
      <HandIcon aria-hidden className="size-3 stroke-2" />,
      "neutral",
    );
  }
  if (activity.awaitingInput) {
    return plain(
      "input",
      gt("Waiting for your answer"),
      <MessageCircleQuestionIcon aria-hidden className="size-3 stroke-2" />,
      "neutral",
    );
  }
  if (live.activity === "writing") {
    return plain(
      "writing",
      gt("Writing", { $context: "the agent is writing its answer" }),
      <AlignLeftIcon aria-hidden className="size-3 stroke-2" />,
    );
  }
  if (step === null) {
    return plain(
      `thinking:${live.thoughtId ?? ""}`,
      gt("Thinking"),
      <BrainIcon aria-hidden className="size-3 stroke-2" />,
    );
  }

  const settled = step.toolLifecycleStatus === "stopped" || step.toolLifecycleStatus === "declined";
  const failed = !settled && workEntryDisplayIndicatesToolFailure(step);
  const running = step.toolLifecycleStatus === "inProgress";
  const parts = workStepParts(step, ctx.workspaceRoot, m);
  const plainLabel = liveWorkEntryLabel(step, ctx.workspaceRoot, running, m);
  const threadLabel = threadReadLabel(plainLabel, step, threadTarget, m);
  // Stopped and declined steps keep their verb and target; the tone says they ended early.
  const showsVerb = threadLabel === null && parts.verb !== null;
  const target = workStepIslandTarget(step, parts, ctx.workspaceRoot, m);
  const labelText =
    threadLabel?.text ??
    (showsVerb && parts.verb !== null
      ? gt("{verb} {target}", {
          verb: parts.verb,
          target,
          $context:
            "a tool step: a short verb such as Read or Run, then what it acted on, such as a file path or a command",
        })
      : plainLabel);
  return {
    stepKey: `${step.id}:${failed ? "failed" : running ? "live" : "done"}`,
    label: threadLabel ? (
      <ThreadReadLabel
        label={threadLabel}
        environmentId={ctx.activeThreadEnvironmentId}
        linked={false}
      />
    ) : showsVerb && parts.verb !== null ? (
      <StepVerbLabel verb={parts.verb} target={target} />
    ) : (
      plainLabel
    ),
    orbIcon: failed ? (
      <XIcon aria-hidden strokeWidth={2.5} className="size-3" />
    ) : (
      <ToolActivityIconView
        icon={step.toolIcon ?? step.toolSource?.icon}
        fallbackName={workEntryIconName(step)}
        className="block size-3 shrink-0 stroke-2"
        muted={false}
      />
    ),
    tone: failed ? "failed" : settled ? "neutral" : "live",
    equalizer: !failed && !settled,
    clockStartedAt,
    ariaLabel: failed ? gt("{label}, tool call failed", { label: labelText }) : labelText,
  };
}

/** A turn's island row: the live header of a running turn, then the summary its steps fold into. */
export function TurnIslandRow({
  row,
  onToggle,
  busy,
  error,
  trailing,
}: {
  row: Extract<TimelineRow, { kind: "turn-fold" }>;
  onToggle: () => void;
  busy: boolean;
  error: string | null;
  trailing: ReactNode;
}) {
  const ctx = use(TimelineRowCtx);
  const gt = useGT();
  const m = useMessages();
  const activity = use(TimelineRowActivityCtx);
  const look = useIslandLook(row.live, row.runId);
  // Only formats the steps the film shows; a long turn would otherwise format every step per update.
  const chips = row.film.map((entry) =>
    workStepChip(entry, workStepParts(entry, ctx.workspaceRoot, m)),
  );
  const steps = row.stepCount;
  const summary =
    row.duration !== null && steps > 0
      ? gt("{duration} · {count, plural, one {{count} step} other {{count} steps}}", {
          duration: row.duration,
          count: steps,
          $context: "a finished turn: how long it took, then how many steps it took",
        })
      : row.duration !== null
        ? row.duration
        : steps > 0
          ? gt("{count, plural, one {{count} step} other {{count} steps}}", { count: steps })
          : gt("Worked");
  const summaryName =
    row.duration === null
      ? summary
      : row.outcome === "interrupted"
        ? gt(
            "You stopped after {duration}, {count, plural, one {{count} step} other {{count} steps}}",
            { duration: row.duration, count: steps },
          )
        : row.outcome === "failed"
          ? gt(
              "Failed after {duration}, {count, plural, one {{count} step} other {{count} steps}}",
              {
                duration: row.duration,
                count: steps,
              },
            )
          : gt("Worked for {duration}, {count, plural, one {{count} step} other {{count} steps}}", {
              duration: row.duration,
              count: steps,
            });
  const captionSource = row.live?.caption?.text ?? null;
  const captionLine = captionSourceLine(activity.liveAnswerPreview ?? captionSource ?? "");
  return (
    <TurnIsland
      live={row.live !== undefined}
      look={look}
      chips={chips}
      hiddenChipCount={row.filmHiddenCount}
      summary={error ? `${summary} · ${error}` : summary}
      summaryGlyph={
        row.outcome === "interrupted" ? "stop" : row.outcome === "failed" ? "fail" : "check"
      }
      expanded={row.expanded}
      onToggle={row.foldable || error ? onToggle : undefined}
      ariaLabel={
        row.live && look ? look.ariaLabel : error ? `${summaryName} · ${error}` : summaryName
      }
      busy={busy}
      caption={
        row.live && captionLine ? (
          <ChatMarkdown
            inline
            text={captionLine}
            cwd={ctx.markdownCwd}
            parseRawHtml={false}
            extensions={thoughtPreviewMarkdown(gt("Thought"))}
          />
        ) : null
      }
      trailing={
        row.live && activity.backgroundWorktreeSetup ? (
          <BackgroundWorktreeSetupChip snapshot={activity.backgroundWorktreeSetup} />
        ) : row.live ? null : (
          trailing
        )
      }
    />
  );
}
