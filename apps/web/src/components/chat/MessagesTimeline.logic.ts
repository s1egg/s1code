import * as DateTime from "effect/DateTime";
import { msg } from "gt-react";
import { worktreeSetupAgentStarted } from "@s1tools/client-runtime/worktree-setup";
import { resolveUserMessagePresentation } from "@s1tools/client-runtime/user-message";
import {
  isLiveSubagentTurnItem,
  waitingOnSubagentsLabel,
} from "@s1tools/client-runtime/state/subagentRuntime";
import * as Equal from "effect/Equal";
import { shallow } from "zustand/vanilla/shallow";
import { claudeResumeCompactionAge } from "@s1tools/shared/claudeCompaction";
import {
  IDLE_COMPACTING_LABELS,
  IDLE_COMPACTION_TITLES,
} from "@s1tools/client-runtime/user-message";
import type { HandoffTimelineRun } from "@s1tools/client-runtime/handoff";
import { renderCodexDirectivesForCopy } from "~/markdown/markdownText";
import {
  commandDisplayText,
  commandProgramName,
} from "@s1tools/client-runtime/work-log/command-label";
import {
  commandlessCommandLabel,
  genericCommandStatusLabel,
  liveActivityToolStatus,
  normalizeCompactToolLabel,
  resolveWorkEntryToolPresentation,
  toolGroupAction,
  contextCompactionTokenCounts,
  workEntriesViewedImagePaths,
  workEntryHiddenByToolCallVisibility,
} from "@s1tools/client-runtime/work-log/presentation";
import {
  deriveRevertTurnCountByUserMessageId,
  isStreamingMessageTextUpdate,
  isStreamingTurnItemTextUpdate,
  timelineEntryIsPersistentResourceCard,
  workEntryDisplayIndicatesToolFailure,
  workEntryIndicatesToolNeutralStatus,
  workLogEntryIsToolLike,
  type TimelineEntry,
  type WorkLogEntry,
} from "../../session-logic";
import {
  type ChatMessage,
  type ProposedPlan,
  type ThreadShell,
  type TurnDiffSummary,
} from "../../types";
import {
  idleCompactionOf,
  isCompactionCommandMessage,
  isOrchestrationV2WorkActive,
  type MessageId,
  type OrchestrationV2IdleCompaction,
  type WorktreeSetupSnapshot,
  type OrchestrationV2ProjectedTurnItem,
  type RunAttemptId,
  type RuntimeRequestId,
  RunId,
  type ThreadId,
  type TurnItemId,
} from "@s1tools/contracts";
import type { ThreadRunSummary } from "@s1tools/client-runtime/state/shell";
import type { ToolCallVisibility } from "@s1tools/contracts/settings";
import { resolveT3McpToolDefinition } from "@s1tools/shared/t3McpToolPresentation";
import { compactDynamicToolOutput } from "@s1tools/shared/toolOutput";
import { htmlRenderReferencesEqual, type HtmlRenderReference } from "@s1tools/shared/htmlRender";
import { mcpAppReferencesEqual, type McpAppReference } from "@s1tools/shared/mcpApp";
import { formatDuration } from "@s1tools/shared/orchestrationTimingCopy";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";
import { m, type MessageResolver } from "../../i18n/messages";
import { collectToolFilePaths } from "@s1tools/shared/toolActivity";
import {
  dynamicToolTitle,
  formatReadToolLabel,
  formatSearchToolLabel,
} from "@s1tools/shared/toolActivityCopy";
import { isHostPath } from "@s1tools/shared/path";

export function timelineEntryRunId(entry: TimelineEntry): RunId | null {
  if (entry.kind === "message") {
    return entry.message.role === "assistant" ? (entry.message.runId ?? null) : null;
  }
  if (entry.kind === "proposed-plan") {
    return entry.proposedPlan.runId;
  }
  if (entry.kind === "html-render" || entry.kind === "mcp-app" || entry.kind === "sent-message") {
    return entry.runId;
  }
  return entry.kind === "work" ? (entry.entry.runId ?? null) : null;
}

function workEntryIsActiveTurnActivity(entry: WorkLogEntry): boolean {
  return (
    entry.toolLifecycleStatus === "inProgress" ||
    (entry.toolLifecycleStatus === undefined &&
      (entry.sourceActivityKind === "task.progress" || workLogEntryIsToolLike(entry)))
  );
}

function workEntryToolDataRecord(entry: WorkLogEntry): Record<string, unknown> | undefined {
  return entry.toolData !== null &&
    typeof entry.toolData === "object" &&
    !Array.isArray(entry.toolData)
    ? (entry.toolData as Record<string, unknown>)
    : undefined;
}

function workEntryReadRawPaths(entry: WorkLogEntry): readonly string[] {
  const fromChanged = entry.changedFiles ?? [];
  if (fromChanged.length > 0) return fromChanged;
  const structured = entry.structuredPayload;
  if (structured?.type === "dynamic_tool") {
    const structuredPaths = collectToolFilePaths({ input: structured.input });
    if (structuredPaths.length > 0) return structuredPaths;
  }
  return collectToolFilePaths(workEntryToolDataRecord(entry));
}

export function workEntryReadPaths(
  entry: WorkLogEntry,
  workspaceRoot: string | undefined,
): string[] {
  return workEntryReadRawPaths(entry).map((filePath) =>
    formatWorkspaceRelativePath(filePath, workspaceRoot),
  );
}

/** Components pass `useMessages()` so the label follows a language switch. */
export function workEntryDisplayLabel(
  entry: WorkLogEntry,
  workspaceRoot: string | undefined,
  resolve: MessageResolver = m,
) {
  if (entry.itemType === "system_notice") return entry.label;
  if (entry.itemType === "reasoning" || entry.tone === "thinking") {
    const thought = entry.detail?.trim().replace(/\s+/g, " ");
    return thought || entry.label;
  }
  const toolPresentation = resolveWorkEntryToolPresentation(entry, undefined, resolve);
  if (toolPresentation) return toolPresentation.displayName;
  if (entry.command?.trim()) return commandDisplayText(entry.command);
  const commandless = commandlessCommandLabel(
    entry,
    liveActivityToolStatus(entry.toolLifecycleStatus, false),
    resolve,
  );
  if (commandless) return commandless;
  const action = toolGroupAction(entry);
  if (action === "code-search" || action === "search") {
    const searchLabel =
      entry.itemType === "file_search"
        ? entry.label
        : formatSearchToolLabel(workEntryToolDataRecord(entry), resolve);
    if (searchLabel) return searchLabel;
  }
  const readPaths = action === "read" ? workEntryReadPaths(entry, workspaceRoot) : [];
  if (action === "read" && readPaths[0]) {
    return formatReadToolLabel(readPaths[0], readPaths.length - 1, resolve);
  }
  const providerRetry =
    entry.projectedItem?.item.type === "error" && entry.projectedItem.item.retry !== undefined;
  const item = entry.structuredPayload;
  const title =
    item?.type === "dynamic_tool"
      ? dynamicToolTitle(item.toolName, item.input, item.title, resolve)
      : null;
  if (title) return title;
  const compactDetail = entry.detail?.trim();
  const detailIsSearchOutput =
    (action === "code-search" || action === "search") && /[\r\n]/.test(compactDetail ?? "");
  if (compactDetail && !providerRetry && action !== "read" && !detailIsSearchOutput) {
    return compactDetail;
  }
  const [firstPath] = entry.changedFiles ?? [];
  if (firstPath) {
    const path = formatWorkspaceRelativePath(firstPath, workspaceRoot);
    return entry.changedFiles!.length === 1
      ? path
      : resolve(
          msg("{count, plural, one {{path} +{count} more} other {{path} +{count} more}}", {
            path,
            count: entry.changedFiles!.length - 1,
          }),
        );
  }
  if (action === "read" && !entry.viewedImagePath) {
    return resolve(msg("Read file"));
  }
  const heading = normalizeCompactToolLabel(entry.toolTitle || entry.label);
  return `${heading.charAt(0).toUpperCase()}${heading.slice(1)}`;
}

export function threadReadTargetId(entry: Pick<WorkLogEntry, "structuredPayload">) {
  const item = entry.structuredPayload;
  if (item?.type !== "dynamic_tool") return null;
  if (resolveT3McpToolDefinition(item.toolName)?.summaryAction !== "thread-read") return null;
  const input = item.input;
  const threadId =
    input !== null && typeof input === "object" && "threadId" in input ? input.threadId : null;
  return typeof threadId === "string" && threadId.trim().length > 0 ? threadId.trim() : null;
}

export function threadReadTargetTitle(
  shell: Pick<ThreadShell, "title" | "archivedAt" | "deletedAt"> | null,
) {
  if (!shell || shell.archivedAt !== null || shell.deletedAt !== null) return null;
  return shell.title.trim() || null;
}

export function workEntryReadOutput(
  entry: Pick<
    WorkLogEntry,
    "changedFiles" | "detail" | "viewedImagePath" | "structuredPayload" | "toolData"
  >,
  workspaceRoot: string | undefined,
): string | null {
  const paths = [
    ...new Set(
      workEntryReadRawPaths(entry as WorkLogEntry)
        .map((path) => {
          const trimmed = path.trim().replaceAll("\\", "/");
          if (!workspaceRoot || isHostPath(trimmed)) {
            return trimmed;
          }
          const root = workspaceRoot.replaceAll("\\", "/").replace(/\/+$/, "");
          const relative = trimmed.replace(/^\.\//, "").replace(/^\/+/, "");
          return `${root}/${relative}`;
        })
        .filter((path) => path.length > 0),
    ),
  ];
  if (paths.length > 0) {
    return paths.join("\n");
  }
  return null;
}

/** Components pass `useMessages()` so the label follows a language switch. */
export function liveWorkEntryLabel(
  entry: WorkLogEntry,
  workspaceRoot: string | undefined,
  active: boolean,
  resolve: MessageResolver = m,
) {
  const status = liveActivityToolStatus(entry.toolLifecycleStatus, active);
  if (entry.itemType === "reasoning") {
    return (
      entry.detail?.trim().replace(/\s+/g, " ") ||
      (status === "inProgress" ? resolve(msg("Thinking")) : resolve(msg("Thought")))
    );
  }
  const toolPresentation = resolveWorkEntryToolPresentation(
    { ...entry, toolLifecycleStatus: status },
    undefined,
    resolve,
  );
  if (toolPresentation) return toolPresentation.displayName;
  const command = entry.command?.trim();
  if (command) {
    const program = commandProgramName(command);
    if (program == null) {
      return genericCommandStatusLabel(status, resolve);
    }
    return resolve(
      status === "inProgress"
        ? msg("Running {program}", { program })
        : status === "failed"
          ? msg("Failed {program}", { program })
          : status === "declined"
            ? msg("Declined {program}", { program })
            : status === "stopped"
              ? msg("Stopped {program}", { program })
              : msg("Ran {program}", { program }),
    );
  }
  return (
    commandlessCommandLabel(entry, status, resolve) ??
    workEntryDisplayLabel(entry, workspaceRoot, resolve)
  );
}

export function workEntryIsVisibleInGroup(
  entry: WorkLogEntry,
  expandedToolGroupEntry = false,
): boolean {
  if (entry.itemType === "reasoning") return Boolean(entry.detail?.trim());
  return (
    (expandedToolGroupEntry &&
      (entry.toolLifecycleStatus === "inProgress" ||
        entry.sourceActivityKind === "task.progress")) ||
    entry.toolLifecycleStatus === "stopped" ||
    !workEntryIndicatesToolNeutralStatus(entry)
  );
}
const TIMELINE_MINIMAP_ITEM_SPACING = 8;
export const TIMELINE_MINIMAP_MIN_ITEMS = 2;
export const TIMELINE_MINIMAP_TARGET_OFFSET = 24;
// Relative to the timeline, not the viewport, so an open terminal shrinks the rail and
// endpoint previews (centered on their strip) still fit above and below it.
const TIMELINE_MINIMAP_MAX_HEIGHT_CSS = "max(4rem, calc(100% - 14.75rem))";
const TIMELINE_MINIMAP_PERSISTENT_GUTTER = 48;

export interface WorkGroupScrollAnchor {
  readonly entryId: string;
  readonly offset: number;
}

export function resolveWorkGroupScrollIndex(
  entries: ReadonlyArray<{ readonly id: string }>,
  anchor: WorkGroupScrollAnchor | undefined,
): { index: number; viewOffset: number } | undefined {
  if (!anchor) return undefined;
  const index = entries.findIndex((entry) => entry.id === anchor.entryId);
  return index < 0 ? undefined : { index, viewOffset: -anchor.offset };
}

export function shouldFollowWorkGroupAppend(
  previous: ReadonlyArray<{ readonly id: string }>,
  entries: ReadonlyArray<{ readonly id: string }>,
  distanceFromEnd: number,
): boolean {
  return (
    previous.length > 0 &&
    entries.length > previous.length &&
    distanceFromEnd <= 1 &&
    previous.every((entry, index) => entry.id === entries[index]?.id)
  );
}

interface TimelineEndState {
  readonly isAtEnd?: boolean;
  readonly isNearEnd?: boolean;
  readonly contentLength?: number;
  readonly scroll?: number;
  readonly scrollLength?: number;
}

// Streaming can briefly unset isAtEnd; re-arm near the content bottom.
const TIMELINE_FOLLOW_REARM_THRESHOLD_PX = 40;

export function resolveTimelineIsAtEnd(state: TimelineEndState | undefined): boolean | undefined {
  if (!state) {
    return undefined;
  }
  const { contentLength, scroll, scrollLength } = state;
  if (contentLength === undefined || scroll === undefined || scrollLength === undefined) {
    return state.isAtEnd;
  }
  // LegendList double-subtracts the composer inset, so its isAtEnd is only a fallback.
  return contentLength - scroll - scrollLength <= TIMELINE_FOLLOW_REARM_THRESHOLD_PX;
}

export function resolveTimelineMinimapHeightStyle(itemCount: number): string {
  const naturalHeight = Math.max(1, (itemCount - 1) * TIMELINE_MINIMAP_ITEM_SPACING);
  return `min(${naturalHeight}px, ${TIMELINE_MINIMAP_MAX_HEIGHT_CSS})`;
}

export function resolveTimelineMinimapTopPercent(index: number, itemCount: number): number {
  if (itemCount <= 1) {
    return 0;
  }
  return (Math.max(0, Math.min(index, itemCount - 1)) / (itemCount - 1)) * 100;
}

export function resolveTimelineMinimapIndexFromPointer(input: {
  readonly itemCount: number;
  readonly railTop: number;
  readonly railHeight: number;
  readonly pointerY: number;
}): number | null {
  if (input.itemCount <= 0 || input.railHeight <= 0) {
    return null;
  }
  if (input.itemCount === 1) {
    return 0;
  }

  const progress = Math.max(0, Math.min(1, (input.pointerY - input.railTop) / input.railHeight));
  return Math.max(0, Math.min(input.itemCount - 1, Math.round(progress * (input.itemCount - 1))));
}

/** Recheck the rendered buffer: LegendList's unbuffered range can lag during scrolling. */
export function resolveTimelineMinimapVisibleRange(state: {
  readonly startBuffered: number | null | undefined;
  readonly endBuffered: number | null | undefined;
  readonly scroll: number;
  readonly scrollLength: number;
  readonly positionAtIndex: (index: number) => number | undefined;
  readonly sizeAtIndex: (index: number) => number | undefined;
}) {
  let start: number | null = null;
  let end: number | null = null;
  if (state.startBuffered == null || state.endBuffered == null || state.startBuffered < 0) {
    return { start, end };
  }
  const bottom = state.scroll + state.scrollLength;
  for (let index = state.startBuffered; index <= state.endBuffered; index += 1) {
    const top = state.positionAtIndex(index);
    const height = state.sizeAtIndex(index);
    if (
      top != null &&
      Number.isFinite(top) &&
      top < bottom &&
      top + Math.max(1, height != null && Number.isFinite(height) ? height : 1) > state.scroll
    ) {
      start ??= index;
      end = index;
    }
  }
  return { start, end };
}

/** A turn spans its user message up to the next one, so a long reply keeps its strip lit. */
export function isTimelineMinimapTurnVisible(
  turnStartRowIndex: number,
  nextTurnStartRowIndex: number | undefined,
  visibleStart: number | null | undefined,
  visibleEnd: number | null | undefined,
): boolean {
  return (
    visibleStart != null &&
    visibleEnd != null &&
    turnStartRowIndex <= visibleEnd &&
    (nextTurnStartRowIndex === undefined || nextTurnStartRowIndex > visibleStart)
  );
}

export function resolveTimelineMinimapCurrentIndex(input: {
  readonly visibleStart: number | null | undefined;
  readonly visibleEnd: number | null | undefined;
  readonly rowIndices: ReadonlyArray<number>;
}): number | null {
  if (input.visibleStart == null || input.visibleEnd == null) {
    return null;
  }
  let precedingIndex: number | null = null;
  for (const [index, rowIndex] of input.rowIndices.entries()) {
    if (rowIndex >= input.visibleStart) {
      // Prefer the first visible user message, otherwise the turn being read.
      return rowIndex <= input.visibleEnd ? index : precedingIndex;
    }
    precedingIndex = index;
  }
  return precedingIndex;
}

function resolveTimelineSideGutter(viewportWidth: number, contentWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0 || !Number.isFinite(contentWidth)) {
    return 0;
  }
  return Math.max(0, (viewportWidth - Math.min(viewportWidth, contentWidth)) / 2);
}

export function resolveTimelineMinimapHasPersistentGutter(
  viewportWidth: number,
  contentWidth: number,
): boolean {
  return (
    resolveTimelineSideGutter(viewportWidth, contentWidth) >= TIMELINE_MINIMAP_PERSISTENT_GUTTER
  );
}

const TIMELINE_MINIMAP_HIT_STRIP_LEFT = 32;
const TIMELINE_MINIMAP_HIT_STRIP_MAX_WIDTH = 40;
const TIMELINE_MINIMAP_NAVIGATION_REACH = 14;

export function resolveTimelineMinimapHitStrip(viewportWidth: number, contentWidth: number) {
  const sideGutter = Math.floor(resolveTimelineSideGutter(viewportWidth, contentWidth));
  if (sideGutter < TIMELINE_MINIMAP_HIT_STRIP_LEFT + TIMELINE_MINIMAP_NAVIGATION_REACH) {
    // Keep a hover target in the gutter, to the left of the sidebar restore handle.
    return { left: 0, width: Math.min(8, sideGutter) };
  }
  return {
    left: TIMELINE_MINIMAP_HIT_STRIP_LEFT,
    width: Math.min(
      TIMELINE_MINIMAP_HIT_STRIP_MAX_WIDTH,
      sideGutter - TIMELINE_MINIMAP_HIT_STRIP_LEFT,
    ),
  };
}

export function resolveTimelineMinimapNavigationInteractive(collapsedWidth: number): boolean {
  return collapsedWidth >= TIMELINE_MINIMAP_NAVIGATION_REACH;
}

function computeElapsedMs(startIso: string, endIso: string): number | null {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function maxIsoTimestamp(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (!Number.isFinite(aMs)) return b;
  if (!Number.isFinite(bMs)) return a;
  return bMs > aMs ? b : a;
}

export type TimelineLatestRun = Pick<
  ThreadRunSummary,
  "runId" | "status" | "startedAt" | "completedAt" | "turnEnded"
>;

export type MessagesTimelineRow = MessagesTimelineRowContent & {
  readonly continuesWorkLog?: boolean;
};

/** Where a row sits among the rows an open turn fold reveals, for their entrance stagger. */
export interface TurnFoldPosition {
  readonly runId: RunId;
  readonly index: number;
}

/** What a running turn's island shows. */
export interface TurnFoldLive {
  /** When the turn started; the island's clock counts from here. */
  readonly startedAt: string | null;
  readonly activity: "step" | "thinking" | "writing" | "approval" | "compacting";
  /** The tool step the island shows while `activity` is "step". */
  readonly step?: WorkLogEntry;
  /** The thought behind "Thinking", so each new one replays the island's entrance. */
  readonly thoughtId?: string;
  /** Replaces "Thinking" while the run waits on subagents. */
  readonly label?: string;
  /** The latest folded thought or commentary, while no answer shows below. */
  readonly caption?: { readonly id: string; readonly text: string };
}

type MessagesTimelineRowContent =
  | {
      kind: "worktree-setup";
      id: string;
      createdAt: string | null;
      snapshot: WorktreeSetupSnapshot;
      embedded: boolean;
    }
  | {
      kind: "work";
      id: string;
      createdAt: string;
      groupedEntries: WorkLogEntry[];
      isExpandedToolGroup: boolean;
      fold?: TurnFoldPosition;
    }
  | {
      /** Images the agent opened in the tool group above, kept visible while the group is collapsed. */
      kind: "viewed-images";
      id: string;
      createdAt: string;
      paths: ReadonlyArray<string>;
    }
  | {
      /** A turn's island: live while the turn runs, then its folded summary. */
      kind: "turn-fold";
      deferredWorkItemIds?: ReadonlyArray<string>;
      id: string;
      createdAt: string;
      runId: RunId;
      expanded: boolean;
      /** Steps the fold hides; reasoning counts. */
      stepCount: number;
      /** The fold hides something, so the island opens. */
      foldable: boolean;
      /** How long the segment took, once it ended. */
      duration: string | null;
      outcome?: "interrupted" | "failed";
      /** The newest finished tool steps, which the film shows. */
      film: ReadonlyArray<WorkLogEntry>;
      filmHiddenCount: number;
      live?: TurnFoldLive;
    }
  | {
      kind: "attempt-fold";
      deferredWorkItemIds?: ReadonlyArray<string>;
      id: string;
      createdAt: string;
      runId: RunId;
      attemptId: RunAttemptId;
      label: string;
      expanded: boolean;
    }
  | {
      kind: "context-compaction";
      id: string;
      createdAt: string;
      label: string;
      tokenCounts: ReturnType<typeof contextCompactionTokenCounts>;
      active: boolean;
      /** Replaces "Context compacted" when S1 Code compacted without being asked. */
      title?: string;
      /** The compaction finished, so `title` names it. */
      compacted?: true;
      failed?: true;
      /** The provider's reason, when a failed compaction gave one. */
      failure?: string;
    }
  | {
      kind: "message";
      id: string;
      createdAt: string;
      message: ChatMessage;
      projectedItem?: OrchestrationV2ProjectedTurnItem;
      showAssistantMeta: boolean;
      suppressEmptyResponse?: boolean;
      showAssistantCopyButton: boolean;
      assistantCopyStreaming: boolean;
      revertTurnCount?: number | undefined;
      /** Another of your messages follows directly, so the two sit closer together. */
      groupedWithNext?: boolean;
      /** Another of your messages sits directly above, so the joined corners tighten. */
      groupedWithPrevious?: boolean;
      /** Set when the message above is a steer too, so the label shows once. */
      continuesSteer?: boolean;
      fold?: TurnFoldPosition;
    }
  | {
      kind: "assistant-meta";
      projectedItem?: OrchestrationV2ProjectedTurnItem;
      id: string;
      createdAt: string;
      message: ChatMessage;
      showAssistantCopyButton: boolean;
      assistantCopyStreaming: boolean;
    }
  | {
      kind: "event";
      id: string;
      createdAt: string;
      projectedItem: OrchestrationV2ProjectedTurnItem;
      subagents?: ReadonlyArray<OrchestrationV2ProjectedTurnItem>;
      resourceSummary?: boolean;
    }
  | {
      kind: "proposed-plan";
      id: string;
      createdAt: string;
      proposedPlan: ProposedPlan;
    }
  | {
      kind: "html-render";
      id: string;
      createdAt: string;
      htmlRender: HtmlRenderReference;
    }
  | {
      kind: "sent-message";
      id: string;
      createdAt: string;
      text: string;
    }
  | {
      kind: "mcp-app";
      id: string;
      createdAt: string;
      sourceThreadId: ThreadId;
      itemId: TurnItemId;
      revision: string;
      mcpApp: McpAppReference;
    };

export interface StableMessagesTimelineRowsState {
  byId: Map<string, MessagesTimelineRow>;
  result: MessagesTimelineRow[];
}

function viewedImagesRows(
  rowId: string,
  createdAt: string,
  groupedEntries: ReadonlyArray<WorkLogEntry>,
): Array<Extract<MessagesTimelineRow, { kind: "viewed-images" }>> {
  const paths = workEntriesViewedImagePaths(groupedEntries);
  return paths.length === 0
    ? []
    : [{ kind: "viewed-images", id: `${rowId}:viewed-images`, createdAt, paths }];
}

export function resolveAssistantMessageCopyState({
  text,
  showCopyButton,
  streaming,
}: {
  text: string | null;
  showCopyButton: boolean;
  streaming: boolean;
}) {
  const hasText = text !== null && text.trim().length > 0;
  const visible = showCopyButton && hasText && !streaming;
  return {
    text: hasText ? (visible ? renderCodexDirectivesForCopy(text) : text) : null,
    visible,
  };
}

/** The provider labelled this message commentary, so it never answers the turn. */
function assistantMessageIsCommentary(entry: Extract<TimelineEntry, { kind: "message" }>) {
  const item = entry.projectedItem?.item;
  return item?.type === "assistant_message" && item.phase === "commentary";
}

function deriveTerminalAssistantMessageIds(timelineEntries: ReadonlyArray<TimelineEntry>) {
  const lastAssistantMessageIdByResponseKey = new Map<string, string>();
  let nullTurnResponseIndex = 0;

  for (const timelineEntry of timelineEntries) {
    if (timelineEntry.kind !== "message") {
      continue;
    }
    const { message } = timelineEntry;
    if (message.role === "user") {
      nullTurnResponseIndex += 1;
      continue;
    }
    if (message.role !== "assistant" || assistantMessageIsCommentary(timelineEntry)) {
      continue;
    }

    const responseKey = message.runId
      ? `turn:${message.runId}`
      : `unkeyed:${nullTurnResponseIndex}`;
    lastAssistantMessageIdByResponseKey.set(responseKey, message.id);
  }

  return new Set(lastAssistantMessageIdByResponseKey.values());
}

interface TurnFold {
  runId: RunId;
  anchorEntryId: string;
  createdAt: string;
  /** The segment's entries in order, including the ones a fold never hides. */
  entries: ReadonlyArray<TimelineEntry>;
  hiddenEntryIds: ReadonlySet<string>;
  entryIds: ReadonlySet<string>;
  duration: string | null;
  outcome: "interrupted" | "failed" | null;
  live: boolean;
  /** The live segment's answer, which stays below its island. */
  answerEntryId: string | null;
  /** A live segment no output has reached yet sits right after its steer, not before an entry. */
  afterAnchor?: true;
  /** When the steer that opened this segment landed; the segment's clock starts there. */
  steeredAt?: string;
}

interface SupersededAttemptFold {
  readonly deferredWorkItemIds: ReadonlyArray<string>;
  readonly runId: RunId;
  readonly attemptId: RunAttemptId;
  readonly anchorEntryId: string;
  readonly createdAt: string;
  readonly hiddenEntryIds: ReadonlySet<string>;
}

// Only an explicit final phase proves a reply cut short by steering was an answer.
function retainedAssistantReplyEntryIds(
  timelineEntries: ReadonlyArray<TimelineEntry>,
): ReadonlySet<string> {
  const replyEntryIds = new Set<string>();
  const lastOutputByAttemptId = new Map<RunAttemptId, TimelineEntry>();
  for (const entry of timelineEntries) {
    if (
      entry.kind === "message" &&
      entry.projectedItem?.item.type === "assistant_message" &&
      entry.projectedItem.item.phase === "final_answer"
    )
      replyEntryIds.add(entry.id);

    if (
      entry.attempt?.status !== "superseded" ||
      (entry.kind === "message" && entry.message.role === "user") ||
      (entry.kind === "work" &&
        (entry.entry.itemType === "system_notice" || entry.entry.itemType === "notification")) ||
      (entry.kind !== "message" && entry.kind !== "work")
    ) {
      continue;
    }
    const previous = lastOutputByAttemptId.get(entry.attempt.id);
    const deferredEnd =
      previous?.kind === "work"
        ? previous.entry.projectedItem?.item.deferredWork?.lastOrdinal
        : undefined;
    const ordinal =
      entry.kind === "work"
        ? entry.entry.projectedItem?.item.ordinal
        : entry.kind === "message"
          ? entry.projectedItem?.item.ordinal
          : undefined;
    if (deferredEnd !== undefined && ordinal !== undefined && deferredEnd > ordinal) continue;
    lastOutputByAttemptId.set(entry.attempt.id, entry);
  }
  for (const entry of lastOutputByAttemptId.values()) {
    const item = entry.kind === "message" ? entry.projectedItem?.item : undefined;
    const supersededAt = entry.attempt?.completedAt ?? null;
    if (
      entry.kind === "message" &&
      !entry.message.streaming &&
      item?.type === "assistant_message" &&
      item.phase === undefined &&
      item.status === "completed" &&
      item.completedAt !== null &&
      supersededAt !== null &&
      DateTime.isLessThan(item.completedAt, supersededAt)
    ) {
      replyEntryIds.add(entry.id);
    }
  }
  return replyEntryIds;
}

function deriveSupersededAttemptFolds(
  timelineEntries: ReadonlyArray<TimelineEntry>,
  unfoldedRunIds: ReadonlySet<RunId>,
  liveSubagentEntryIds: ReadonlySet<string>,
  retainedReplyEntryIds: ReadonlySet<string>,
): ReadonlyMap<string, SupersededAttemptFold> {
  const retainedAttemptIds = new Set(
    timelineEntries.flatMap((entry) =>
      entry.attempt !== undefined && retainedReplyEntryIds.has(entry.id) ? [entry.attempt.id] : [],
    ),
  );
  const entriesByAttemptId = new Map<RunAttemptId, TimelineEntry[]>();
  for (const entry of timelineEntries) {
    if (
      entry.attempt?.status !== "superseded" ||
      retainedAttemptIds.has(entry.attempt.id) ||
      unfoldedRunIds.has(entry.attempt.runId) ||
      (entry.kind === "message" && entry.message.role === "user") ||
      (entry.kind === "event" && entry.projectedItem.item.type === "handoff") ||
      entry.kind === "html-render" ||
      entry.kind === "mcp-app" ||
      entry.kind === "sent-message" ||
      timelineEntryIsPersistentResourceCard(entry) ||
      liveSubagentEntryIds.has(entry.id) ||
      (entry.kind === "work" && entry.entry.itemType === "system_notice")
    ) {
      continue;
    }
    const entries = entriesByAttemptId.get(entry.attempt.id) ?? [];
    entries.push(entry);
    entriesByAttemptId.set(entry.attempt.id, entries);
  }

  const foldsByAnchorEntryId = new Map<string, SupersededAttemptFold>();
  for (const entries of entriesByAttemptId.values()) {
    const firstEntry = entries[0];
    const attempt = firstEntry?.attempt;
    if (firstEntry === undefined || attempt === undefined) continue;
    foldsByAnchorEntryId.set(firstEntry.id, {
      deferredWorkItemIds: entries.flatMap((entry) =>
        entry.kind === "work" && entry.entry.projectedItem?.item.deferredWork
          ? [String(entry.entry.projectedItem.sourceItemId)]
          : [],
      ),
      runId: attempt.runId,
      attemptId: attempt.id,
      anchorEntryId: firstEntry.id,
      createdAt: firstEntry.createdAt,
      hiddenEntryIds: new Set(entries.map((entry) => entry.id)),
    });
  }
  return foldsByAnchorEntryId;
}

// After send, the previous turn stays active until the server creates its replacement.
function deriveUnsettledRunId(
  latestRun: TimelineLatestRun | null,
  runningRunId: RunId | null = null,
): RunId | null {
  if (runningRunId !== null) return runningRunId;
  if (!latestRun) {
    return null;
  }
  const isSettled =
    latestRun.completedAt !== null &&
    latestRun.status !== "running" &&
    latestRun.status !== "starting" &&
    latestRun.status !== "waiting";
  return isSettled ? null : latestRun.runId;
}

// Children can outlive their launching turn; keep cards visible while the footer counts them.
function liveSubagentCardEntryIds(entries: ReadonlyArray<TimelineEntry>): ReadonlySet<string> {
  const visible = new Set<string>();
  let batch: Array<Extract<TimelineEntry, { kind: "event" }>> = [];
  const flush = () => {
    if (batch.length === 0) return;
    if (batch.some((entry) => isLiveSubagentTurnItem(entry.projectedItem.item))) {
      for (const entry of batch) visible.add(entry.id);
    }
    batch = [];
  };
  for (const entry of entries) {
    if (entry.kind !== "event" || entry.projectedItem.item.type !== "subagent") {
      flush();
      continue;
    }
    const item = entry.projectedItem.item;
    const previous = batch.at(-1)?.projectedItem.item;
    if (
      previous !== undefined &&
      (previous.runId !== item.runId || previous.providerTurnId !== item.providerTurnId)
    ) {
      flush();
    }
    batch.push(entry);
  }
  flush();
  return visible;
}

function timelineEntryFoldRunId(entry: TimelineEntry, runlessKey: RunId | null): RunId | null {
  if (entry.kind === "work" && entry.entry.itemType === "system_notice") return null;
  if (entry.kind === "message" && entry.message.role === "assistant") {
    return entry.message.runId ?? runlessKey;
  }
  if (entry.kind === "work") {
    return entry.entry.runId ?? runlessKey;
  }
  if (
    entry.kind === "event" &&
    (timelineEntryIsPersistentResourceCard(entry) || entry.projectedItem.item.type === "subagent")
  ) {
    return entry.projectedItem.item.runId ?? runlessKey;
  }
  return null;
}

function timelineEntryIsSteer(entry: TimelineEntry): boolean {
  return (
    entry.kind === "message" &&
    entry.message.role === "user" &&
    (entry.message.inputIntent === "steer" ||
      entry.message.inputIntent === "promoted_queued_to_steer")
  );
}

export function timelineEntryStartsResponse(entry: TimelineEntry): boolean {
  return (
    (entry.kind === "message" && entry.message.role === "user" && !timelineEntryIsSteer(entry)) ||
    (entry.kind === "work" && entry.entry.itemType === "notification")
  );
}

function timelineEntryEnd(entry: TimelineEntry): string {
  return entry.kind === "message" ? entry.message.updatedAt : entry.createdAt;
}

function timelineEntryIsCompaction(entry: TimelineEntry): boolean {
  return entry.kind === "work" && entry.entry.sourceActivityKind === "context-compaction";
}

function responseBoundaryRunId(entry: TimelineEntry): RunId | null {
  if (entry.kind === "message") return entry.message.runId ?? null;
  if (entry.kind === "work") return entry.entry.runId ?? null;
  return null;
}

// Group promptless restarts under the initiating prompt until settled.
function lastResponseBoundaryIndex(timelineEntries: ReadonlyArray<TimelineEntry>): number {
  return timelineEntries.findLastIndex(timelineEntryStartsResponse);
}

function deriveActiveVisualResponseRunIds(input: {
  timelineEntries: ReadonlyArray<TimelineEntry>;
  unsettledRunId: RunId | null;
  isWorking: boolean;
}): ReadonlySet<RunId> {
  const runIds = new Set<RunId>();
  if (input.unsettledRunId === null) {
    return runIds;
  }

  runIds.add(input.unsettledRunId);
  if (!input.isWorking) {
    return runIds;
  }

  const latestResponseBoundaryIndex = lastResponseBoundaryIndex(input.timelineEntries);
  for (
    let index = latestResponseBoundaryIndex + 1;
    index < input.timelineEntries.length;
    index += 1
  ) {
    const runId = timelineEntryRunId(input.timelineEntries[index]!);
    if (runId !== null) {
      runIds.add(runId);
    }
  }
  return runIds;
}

function timelineEntryFailedItem(entry: TimelineEntry) {
  const item =
    entry.kind === "event"
      ? entry.projectedItem.item
      : entry.kind === "work"
        ? entry.entry.projectedItem?.item
        : null;
  return item?.type === "error" && item.status === "failed" && item.parentItemId === null
    ? item
    : null;
}

function failedTimelineRunIds(
  entries: ReadonlyArray<TimelineEntry>,
  latestRun: TimelineLatestRun | null,
) {
  const failed = new Set<RunId>();
  if (latestRun?.status === "failed") failed.add(latestRun.runId);
  for (const entry of entries) {
    const runId = timelineEntryFailedItem(entry)?.runId;
    if (runId) failed.add(runId);
  }
  return failed;
}

function workEntryIsPendingApproval(
  entry: WorkLogEntry,
  pendingApprovalRequestIds: ReadonlySet<RuntimeRequestId> | undefined,
): boolean {
  const item = entry.projectedItem?.item;
  return (
    item?.type === "approval_request" && pendingApprovalRequestIds?.has(item.requestId) === true
  );
}

function workEntryIsError(entry: WorkLogEntry): boolean {
  return (
    entry.tone === "error" ||
    entry.sourceActivityKind === "runtime.error" ||
    (entry.itemType === "error" && entry.toolLifecycleStatus === "failed")
  );
}

function deriveTurnFolds(input: {
  timelineEntries: ReadonlyArray<TimelineEntry>;
  terminalAssistantMessageIds: ReadonlySet<string>;
  latestRun: TimelineLatestRun | null;
  failedRunIds: ReadonlySet<RunId>;
  /** The run whose last segment is live, if the thread is working on one. */
  liveRunId: RunId | null;
  /** The latest prompt's runless response is live. */
  runlessLive: boolean;
  liveSubagentEntryIds: ReadonlySet<string>;
  retainedAssistantReplyEntryIds: ReadonlySet<string>;
  pendingApprovalRequestIds: ReadonlySet<RuntimeRequestId> | undefined;
  resolve: MessageResolver;
}): {
  readonly foldsByAnchorEntryId: ReadonlyMap<string, TurnFold>;
  readonly liveKey: RunId | null;
  /** Steps that never reported their end, settled once their run or attempt ended. */
  readonly settledStatusByEntryId: ReadonlyMap<string, "stopped" | "completed">;
} {
  const interruptedRunIds = new Set<RunId>();
  const promptIndexByRunId = new Map<RunId, number>();
  for (const [index, entry] of input.timelineEntries.entries()) {
    if (timelineEntryStartsResponse(entry)) {
      const runId = responseBoundaryRunId(entry);
      if (runId !== null && !promptIndexByRunId.has(runId)) promptIndexByRunId.set(runId, index);
    }
    if (
      entry.kind === "event" &&
      entry.projectedItem.item.runId !== null &&
      (entry.projectedItem.item.type === "run_interrupt_request" ||
        entry.projectedItem.item.type === "run_interrupt_result")
    ) {
      interruptedRunIds.add(entry.projectedItem.item.runId);
    }
  }

  interface TurnGroup {
    entries: Array<TimelineEntry>;
    terminalEntry: Extract<TimelineEntry, { kind: "message" }> | null;
    // Entry timestamps omit startup and can collapse steered turns to an instant.
    startBoundary: string | null;
    anchorEntryId: string;
    /**
     * Each steer after the turn has produced output starts a new segment at
     * this index into `entries`, so the steer sits between the work it split.
     */
    steerSegments: Array<{ startIndex: number; steer: TimelineEntry }>;
  }
  const groupsByRunId = new Map<RunId, TurnGroup>();
  const runlessFailedKeys = new Set<RunId>();

  // Key runless responses per prompt to prevent V2 runs unfolding imported turns.
  let runlessKey: RunId | null = null;
  let responseKey: RunId | null = null;
  let pendingBoundary: { createdAt: string; anchorEntryId: string } | null = null;
  for (const [index, entry] of input.timelineEntries.entries()) {
    if (timelineEntryStartsResponse(entry)) {
      const nextEntry = input.timelineEntries[index + 1];
      pendingBoundary = nextEntry
        ? { createdAt: entry.createdAt, anchorEntryId: nextEntry.id }
        : null;
      const boundaryRunId = responseBoundaryRunId(entry);
      runlessKey = boundaryRunId == null ? RunId.make(`runless:${entry.id}`) : null;
      responseKey = boundaryRunId ?? runlessKey;
      continue;
    }
    if (entry.kind === "message" && timelineEntryIsSteer(entry)) {
      const steerRunId = entry.message.runId ?? responseKey;
      if (steerRunId === null) continue;
      // Every steer opens a segment, even one sent before any output (or before output that tool
      // visibility filtered out), so the work that answers it sits below it.
      let group = groupsByRunId.get(steerRunId);
      if (!group) {
        group = {
          entries: [],
          terminalEntry: null,
          startBoundary: pendingBoundary?.createdAt ?? null,
          anchorEntryId: pendingBoundary?.anchorEntryId ?? entry.id,
          steerSegments: [],
        };
        pendingBoundary = null;
        groupsByRunId.set(steerRunId, group);
      }
      // Back-to-back steers split once, after the last of them.
      if (group.steerSegments.at(-1)?.startIndex === group.entries.length) {
        group.steerSegments.pop();
      }
      group.steerSegments.push({ startIndex: group.entries.length, steer: entry });
      continue;
    }
    const ownRunId = timelineEntryFoldRunId(entry, runlessKey);
    if (!ownRunId) {
      continue;
    }
    // Resumed subagents keep their position and fold with their original turn.
    const runId =
      responseKey !== null && (promptIndexByRunId.get(ownRunId) ?? -1) > index
        ? responseKey
        : ownRunId;
    if (runId === runlessKey && timelineEntryFailedItem(entry) !== null) {
      runlessFailedKeys.add(runId);
    }
    let group = groupsByRunId.get(runId);
    if (!group) {
      group = {
        entries: [],
        terminalEntry: null,
        startBoundary: pendingBoundary?.createdAt ?? null,
        anchorEntryId: pendingBoundary?.anchorEntryId ?? entry.id,
        steerSegments: [],
      };
      pendingBoundary = null;
      groupsByRunId.set(runId, group);
    }
    group.entries.push(entry);
    if (entry.kind === "message" && input.terminalAssistantMessageIds.has(entry.message.id)) {
      group.terminalEntry = entry;
    }
  }

  const liveKey = input.liveRunId ?? (input.runlessLive ? runlessKey : null);
  const { resolve } = input;
  const foldsByAnchorEntryId = new Map<string, TurnFold>();
  const settledStatusByEntryId = new Map<string, "stopped" | "completed">();
  for (const [runId, group] of groupsByRunId) {
    // A steer nothing has answered yet still starts the live segment, right below it.
    const segments = [
      { startIndex: 0, steer: null as TimelineEntry | null },
      ...group.steerSegments,
    ].filter(
      ({ startIndex }, index, all) =>
        startIndex < (all[index + 1]?.startIndex ?? group.entries.length) ||
        (runId === liveKey && index === all.length - 1),
    );
    const liveSegmentIndex = runId === liveKey ? segments.length - 1 : -1;
    const terminalEntryIndex = group.terminalEntry
      ? group.entries.findIndex((entry) => entry.id === group.terminalEntry?.id)
      : group.entries.length;
    // Folded dividers lose their place in the turn, so only the latest stays visible.
    const visibleCompactionId = group.entries.findLast(timelineEntryIsCompaction)?.id;
    // Notices that never count as the agent moving on past its latest message.
    const isNotice = (entry: TimelineEntry) =>
      entry.kind === "work" &&
      (entry.entry.itemType === "notification" ||
        entry.entry.questionAnswer !== undefined ||
        workEntryIsError(entry.entry));
    const staysVisible = (entry: TimelineEntry) =>
      entry.id === visibleCompactionId ||
      timelineEntryIsPersistentResourceCard(entry) ||
      input.liveSubagentEntryIds.has(entry.id) ||
      input.retainedAssistantReplyEntryIds.has(entry.id) ||
      isNotice(entry) ||
      (entry.kind === "work" &&
        workEntryIsPendingApproval(entry.entry, input.pendingApprovalRequestIds));

    const interrupted =
      interruptedRunIds.has(runId) ||
      (input.latestRun?.runId === runId && input.latestRun.status === "interrupted");
    const runOutcome = interrupted
      ? ("interrupted" as const)
      : input.failedRunIds.has(runId) || runlessFailedKeys.has(runId)
        ? ("failed" as const)
        : null;
    const outcome = liveSegmentIndex >= 0 ? null : runOutcome;
    // A step that never reported its end settles once its run or its attempt has ended.
    for (const entry of group.entries) {
      if (entry.kind !== "work" || entry.entry.toolLifecycleStatus !== "inProgress") continue;
      const supersededAttempt = entry.attempt?.status === "superseded";
      if (runId !== liveKey || supersededAttempt) {
        settledStatusByEntryId.set(
          entry.id,
          runOutcome !== null || supersededAttempt ? "stopped" : "completed",
        );
      }
    }
    const effectiveStatus = (entry: Extract<TimelineEntry, { kind: "work" }>) =>
      settledStatusByEntryId.get(entry.id) ?? entry.entry.toolLifecycleStatus;
    // A turn cut short by a steer leaves trailing work entries behind its
    // terminal message — take whichever ended last. A subagent card after it was
    // spawned by background work once the turn settled, so it adds no turn time.
    const lateSubagentIds = new Set(
      group.entries.flatMap((entry, index) =>
        index > terminalEntryIndex &&
        entry.kind === "event" &&
        entry.projectedItem.item.type === "subagent"
          ? [entry.id]
          : [],
      ),
    );
    const turnDuration = () => {
      const firstEntry = group.entries[0]!;
      const lastTurnEntry =
        group.entries.findLast((entry) => !lateSubagentIds.has(entry.id)) ?? group.entries.at(-1)!;
      const lastEntryEnd = timelineEntryEnd(lastTurnEntry);
      const elapsedMs =
        input.latestRun?.runId === runId && input.latestRun.startedAt && input.latestRun.completedAt
          ? computeElapsedMs(input.latestRun.startedAt, input.latestRun.completedAt)
          : computeElapsedMs(
              group.startBoundary ?? firstEntry.createdAt,
              maxIsoTimestamp(group.terminalEntry?.message.updatedAt ?? null, lastEntryEnd) ??
                lastEntryEnd,
            );
      return elapsedMs === null ? null : formatDuration(elapsedMs, resolve);
    };

    for (const [segmentIndex, { startIndex, steer }] of segments.entries()) {
      const entries = group.entries.slice(startIndex, segments[segmentIndex + 1]?.startIndex);
      const live = segmentIndex === liveSegmentIndex;
      const hiddenEntryIds = new Set<string>();
      let answerEntryId: string | null = null;
      if (live) {
        for (const entry of entries) {
          if (
            entry.kind === "message" &&
            entry.message.role === "assistant" &&
            !assistantMessageIsCommentary(entry)
          ) {
            answerEntryId = entry.id;
          } else if (entry.kind === "work" && !isNotice(entry)) {
            answerEntryId = null;
          }
        }
        for (const entry of entries) {
          if (entry.id !== answerEntryId && !staysVisible(entry)) hiddenEntryIds.add(entry.id);
        }
      } else {
        for (const [offset, entry] of entries.entries()) {
          const index = startIndex + offset;
          if (entry.id === group.terminalEntry?.id || staysVisible(entry)) continue;
          const isFoldableTrailingActivity =
            entry.kind === "work" &&
            effectiveStatus(entry) !== "inProgress" &&
            !workEntryDisplayIndicatesToolFailure(entry.entry);
          if (
            !timelineEntryIsCompaction(entry) &&
            index > terminalEntryIndex &&
            !isFoldableTrailingActivity
          ) {
            continue;
          }
          hiddenEntryIds.add(entry.id);
        }
        if (
          !entries.some(
            (entry) => hiddenEntryIds.has(entry.id) && !timelineEntryIsCompaction(entry),
          )
        ) {
          continue;
        }
      }
      const afterAnchor = steer !== null && entries.length === 0;
      const anchorEntryId =
        steer === null ? group.anchorEntryId : afterAnchor ? steer.id : entries[0]!.id;
      // A segment a later steer cut short lasted until that steer, so its settled time never grows.
      const nextSteerAt = segments[segmentIndex + 1]?.steer?.createdAt ?? null;
      const segmentStart = steer?.createdAt ?? group.startBoundary ?? entries[0]?.createdAt ?? null;
      const segmentMs =
        nextSteerAt !== null && segmentStart !== null
          ? computeElapsedMs(segmentStart, nextSteerAt)
          : steer === null
            ? null
            : computeElapsedMs(
                steer.createdAt,
                entries
                  .filter((entry) => !lateSubagentIds.has(entry.id))
                  .map(timelineEntryEnd)
                  .reduce<string | null>(maxIsoTimestamp, null) ?? steer.createdAt,
              );
      foldsByAnchorEntryId.set(anchorEntryId, {
        // Work after a steer folds under its own key, so each segment opens on its own.
        runId: steer === null ? runId : RunId.make(`${runId}:steer:${steer.id}`),
        anchorEntryId,
        createdAt: steer?.createdAt ?? group.startBoundary ?? entries[0]!.createdAt,
        ...(afterAnchor ? { afterAnchor: true as const } : {}),
        ...(steer === null ? {} : { steeredAt: steer.createdAt }),
        entries,
        hiddenEntryIds,
        entryIds: new Set(entries.map((entry) => entry.id)),
        duration: live
          ? null
          : steer === null && nextSteerAt === null
            ? turnDuration()
            : segmentMs === null
              ? null
              : formatDuration(segmentMs, resolve),
        outcome: segmentIndex === segments.length - 1 ? outcome : null,
        live,
        answerEntryId,
      });
    }
  }
  return { foldsByAnchorEntryId, liveKey, settledStatusByEntryId };
}

function attachTrailingToolGroupsToAssistant(
  rows: ReadonlyArray<MessagesTimelineRow>,
): MessagesTimelineRow[] {
  const messageRowsWithoutMeta = new Set<string>();
  const metaRowsAfterIndex = new Map<
    number,
    Extract<MessagesTimelineRow, { kind: "assistant-meta" }>
  >();

  for (const [messageIndex, row] of rows.entries()) {
    const runId = row.kind === "message" ? (row.message.runId ?? null) : null;
    if (
      row.kind !== "message" ||
      row.message.role !== "assistant" ||
      !row.showAssistantMeta ||
      runId === null
    ) {
      continue;
    }

    let lastTrailingWorkIndex = -1;
    let hasTrailingToolGroup = false;
    for (let index = messageIndex + 1; index < rows.length; index += 1) {
      const candidate = rows[index];
      if (!candidate || candidate.kind === "message") {
        break;
      }
      if (
        candidate.kind === "event" &&
        candidate.resourceSummary &&
        candidate.projectedItem.item.runId === runId
      ) {
        hasTrailingToolGroup = true;
        lastTrailingWorkIndex = index;
        continue;
      }
      if (
        candidate.kind === "work" &&
        candidate.groupedEntries.some((entry) => entry.runId === runId)
      ) {
        if (
          candidate.groupedEntries.some(
            (entry) =>
              workLogEntryIsToolLike(entry) ||
              (entry.projectedItem?.item.type === "error" &&
                entry.projectedItem.item.status === "failed"),
          )
        ) {
          hasTrailingToolGroup = true;
        }
        if (hasTrailingToolGroup) {
          lastTrailingWorkIndex = index;
        }
      }
    }

    if (lastTrailingWorkIndex < 0) {
      continue;
    }

    messageRowsWithoutMeta.add(row.id);
    metaRowsAfterIndex.set(lastTrailingWorkIndex, {
      kind: "assistant-meta",
      id: `assistant-meta:${row.message.id}`,
      ...(row.projectedItem === undefined ? {} : { projectedItem: row.projectedItem }),
      createdAt: rows[lastTrailingWorkIndex]?.createdAt ?? row.message.updatedAt,
      message: row.message,
      showAssistantCopyButton: row.showAssistantCopyButton,
      assistantCopyStreaming: row.assistantCopyStreaming,
    });
  }

  const result: MessagesTimelineRow[] = [];
  for (const [index, row] of rows.entries()) {
    if (row.kind === "message" && messageRowsWithoutMeta.has(row.id)) {
      result.push({ ...row, showAssistantMeta: false, showAssistantCopyButton: false });
    } else {
      result.push(row);
    }
    const metaRow = metaRowsAfterIndex.get(index);
    if (metaRow) {
      result.push(metaRow);
    }
  }
  return result;
}

// Hide delegation rows only when task ids identify durable child cards; prompts can repeat.
function withoutSubagentDelegationRows(entries: ReadonlyArray<TimelineEntry>) {
  const childrenByRun = new Map<RunId, Set<string>>();
  for (const entry of entries) {
    if (entry.kind !== "event" || entry.projectedItem.item.type !== "subagent") continue;
    const item = entry.projectedItem.item;
    if (item.origin !== "app_owned" || item.runId === null) continue;
    const children = childrenByRun.get(item.runId) ?? new Set<string>();
    children.add(item.subagentId);
    childrenByRun.set(item.runId, children);
  }
  return entries.filter((entry) => {
    if (entry.kind !== "work" || workEntryDisplayIndicatesToolFailure(entry.entry)) return true;
    const item = entry.entry.projectedItem?.item ?? entry.entry.structuredPayload;
    if (
      item?.type !== "dynamic_tool" ||
      item.runId === null ||
      (item.status !== "running" && item.status !== "completed") ||
      resolveT3McpToolDefinition(item.toolName)?.summaryAction !== "delegate"
    )
      return true;
    const output = compactDynamicToolOutput(item.output);
    if (output?.isError) return true;
    if (output?.taskId !== undefined) {
      return !childrenByRun.get(item.runId)?.has(output.taskId);
    }
    return true;
  });
}

const supersededReasoningEntries = new WeakMap<TimelineEntry, TimelineEntry>();

function settleSupersededReasoning(entries: ReadonlyArray<TimelineEntry>) {
  return entries.map((entry, index) => {
    if (
      index === entries.length - 1 ||
      entry.kind !== "work" ||
      entry.entry.itemType !== "reasoning" ||
      entry.entry.toolLifecycleStatus !== "inProgress"
    ) {
      return entry;
    }
    let settled = supersededReasoningEntries.get(entry);
    if (!settled) {
      settled = { ...entry, entry: { ...entry.entry, toolLifecycleStatus: "completed" } };
      supersededReasoningEntries.set(entry, settled);
    }
    return settled;
  });
}

function workShownAsFinalAnswerOnly(
  entry: TimelineEntry,
  pendingApprovalRequestIds: ReadonlySet<RuntimeRequestId> | undefined,
): boolean {
  if (entry.kind === "event") return entry.projectedItem.item.type !== "subagent";
  if (entry.kind !== "work") return true;
  const work = entry.entry;
  const item = work.projectedItem?.item;
  return (
    (item?.type === "approval_request" &&
      pendingApprovalRequestIds?.has(item.requestId) === true) ||
    work.questionAnswer !== undefined ||
    timelineEntryIsCompaction(entry) ||
    timelineEntryStartsResponse(entry) ||
    work.tone === "error" ||
    work.sourceActivityKind === "runtime.error" ||
    (work.itemType === "error" && work.toolLifecycleStatus !== "completed")
  );
}

function deriveInFlightSteerAnswerIds(entries: ReadonlyArray<TimelineEntry>): ReadonlySet<string> {
  const ids = new Set<string>();
  let awaitingReply = false;
  let candidate: string | null = null;
  for (const entry of entries) {
    if (entry.kind === "work" && entry.entry.itemType === "reasoning") continue;
    const reply = entry.kind === "message" && entry.message.role === "assistant" ? entry : null;
    if (candidate !== null && reply !== null) ids.add(candidate);
    candidate = null;
    if (timelineEntryIsSteer(entry)) {
      awaitingReply = true;
    } else if (entry.kind === "message" && entry.message.role === "user") {
      awaitingReply = false;
    } else if (reply !== null && awaitingReply) {
      candidate = reply.message.id;
      awaitingReply = false;
    }
  }
  return ids;
}

/** The latest text zen hides from a running turn, for the island's caption to quote. */
export function liveAnswerPreview(entries: ReadonlyArray<TimelineEntry>): string | null {
  const boundary = lastResponseBoundaryIndex(entries);
  for (let index = entries.length - 1; index > boundary; index -= 1) {
    const entry = entries[index]!;
    // A steer starts a new segment; text before it belongs to the island above.
    if (timelineEntryIsSteer(entry)) return null;
    const text =
      entry.kind === "message" && entry.message.role === "assistant"
        ? entry.message.text
        : entry.kind === "work" && entry.entry.itemType === "reasoning"
          ? (entry.entry.detail ?? "")
          : "";
    if (text.trim() !== "") return text;
  }
  return null;
}

/** Reads entries before tool visibility filters them, so hidden newer parent work still counts. */
function runningSubagentsAtRunTail(entries: ReadonlyArray<TimelineEntry>, runId: RunId): number {
  let running = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    // The run's own finished reply is the parent parking on the children, not new work.
    if (
      entry.kind === "message" &&
      entry.message.role === "assistant" &&
      !entry.message.streaming &&
      entry.message.runId === runId
    ) {
      continue;
    }
    if (entry.kind !== "event") break;
    const { item } = entry.projectedItem;
    if (item.type !== "subagent" || item.runId !== runId) break;
    if (isLiveSubagentTurnItem(item)) running += 1;
  }
  return running;
}

function timelineRowEntries(
  input: Pick<
    MessagesTimelineRowsInput,
    | "timelineEntries"
    | "toolCallVisibility"
    | "revealedMessageId"
    | "isWorking"
    | "latestRun"
    | "runningRunId"
    | "pendingApprovalRequestIds"
  >,
) {
  const visibility = input.toolCallVisibility ?? "showAll";
  const entries = input.timelineEntries;
  let shown = entries;
  if (visibility === "zen") {
    const answering = input.isWorking && input.latestRun?.turnEnded !== true;
    const answeringRunId = answering
      ? deriveUnsettledRunId(input.latestRun ?? null, input.runningRunId ?? null)
      : null;
    const answeringFrom = answering ? lastResponseBoundaryIndex(entries) + 1 : entries.length;
    const terminalIds = deriveTerminalAssistantMessageIds(entries);
    const steerAnswerIds = deriveInFlightSteerAnswerIds(entries);
    const retainedReplyIds = retainedAssistantReplyEntryIds(entries);
    shown = entries.filter((entry, index) => {
      if (entry.kind !== "message") {
        return workShownAsFinalAnswerOnly(entry, input.pendingApprovalRequestIds);
      }
      const { message } = entry;
      return (
        message.role !== "assistant" ||
        message.id === input.revealedMessageId ||
        steerAnswerIds.has(message.id) ||
        retainedReplyIds.has(entry.id) ||
        (terminalIds.has(message.id) &&
          index < answeringFrom &&
          (answeringRunId === null || message.runId !== answeringRunId))
      );
    });
  } else if (visibility !== "showAll") {
    shown = entries.filter(
      (entry) =>
        entry.kind !== "work" || !workEntryHiddenByToolCallVisibility(entry.entry, visibility),
    );
  }
  return withoutSubagentDelegationRows(settleSupersededReasoning(shown));
}

type TurnFoldInput = Pick<
  MessagesTimelineRowsInput,
  "latestRun" | "isWorking" | "runlessWorkActive" | "runningRunId" | "pendingApprovalRequestIds"
>;

/** The unsettled run, unless the thread is idle or the run's turn already ended. */
function liveTurnRunId(input: TurnFoldInput): RunId | null {
  const unsettledRunId = deriveUnsettledRunId(input.latestRun ?? null, input.runningRunId ?? null);
  return input.isWorking &&
    unsettledRunId !== null &&
    !(input.latestRun?.turnEnded === true && input.latestRun.runId === unsettledRunId)
    ? unsettledRunId
    : null;
}

function timelineTurnFolds(
  input: TurnFoldInput,
  timelineEntries: ReadonlyArray<TimelineEntry>,
  resolve: MessageResolver,
) {
  return deriveTurnFolds({
    timelineEntries,
    terminalAssistantMessageIds: deriveTerminalAssistantMessageIds(timelineEntries),
    latestRun: input.latestRun ?? null,
    failedRunIds: failedTimelineRunIds(timelineEntries, input.latestRun ?? null),
    liveRunId: liveTurnRunId(input),
    runlessLive: input.isWorking && input.runlessWorkActive === true,
    liveSubagentEntryIds: liveSubagentCardEntryIds(timelineEntries),
    retainedAssistantReplyEntryIds: retainedAssistantReplyEntryIds(timelineEntries),
    pendingApprovalRequestIds: input.pendingApprovalRequestIds,
    resolve,
  });
}

function deriveTimelineTurnFolds(
  input: Pick<
    MessagesTimelineRowsInput,
    | "timelineEntries"
    | "latestRun"
    | "isWorking"
    | "runlessWorkActive"
    | "runningRunId"
    | "toolCallVisibility"
    | "revealedMessageId"
    | "pendingApprovalRequestIds"
  >,
): ReadonlyMap<string, TurnFold> {
  if (input.toolCallVisibility === "zen") return new Map<string, TurnFold>();
  return timelineTurnFolds(input, timelineRowEntries(input), m).foldsByAnchorEntryId;
}

const FILM_STEP_LIMIT = 5;
const settledWorkEntries = new WeakMap<WorkLogEntry, WorkLogEntry>();

function settledWorkEntry(entry: WorkLogEntry, status: "stopped" | "completed"): WorkLogEntry {
  let settled = settledWorkEntries.get(entry);
  if (settled?.toolLifecycleStatus !== status) {
    settled = { ...entry, toolLifecycleStatus: status };
    settledWorkEntries.set(entry, settled);
  }
  return settled;
}
const PENDING_TURN_FOLD_RUN_ID = RunId.make("pending");

function workEntryIsRequest(entry: WorkLogEntry): boolean {
  const type = entry.projectedItem?.item.type ?? entry.itemType;
  return type === "approval_request" || type === "user_input_request";
}

/** A step the island counts, names, and films: a tool call, a thought, or a plan update. */
function workEntryIsIslandStep(entry: WorkLogEntry): boolean {
  return (
    workLogEntryIsToolLike(entry) ||
    (entry.structuredPayload?.type === "todo_list" && entry.structuredPayload.steps.length > 0)
  );
}

/** A finished step the agent took itself, as the island's film shows it. */
function workEntryIsFilmStep(entry: WorkLogEntry): boolean {
  return (
    entry.itemType !== "reasoning" &&
    !workEntryIsRequest(entry) &&
    entry.toolLifecycleStatus !== "inProgress" &&
    workEntryIsIslandStep(entry) &&
    workEntryIsVisibleInGroup(entry, true)
  );
}

// The server folds only these into a deferred history anchor (threadHistoryPaging.ts).
const DEFERRED_WORK_ITEM_TYPES: ReadonlySet<string> = new Set([
  "command_execution",
  "reasoning",
  "file_change",
  "file_search",
  "web_search",
  "dynamic_tool",
]);

function workEntryIsStandalone(
  entry: WorkLogEntry,
  isPendingApproval: (entry: WorkLogEntry) => boolean,
): boolean {
  return (
    isPendingApproval(entry) ||
    workEntryIsError(entry) ||
    entry.itemType === "system_notice" ||
    entry.itemType === "notification" ||
    entry.questionAnswer !== undefined
  );
}

export function deriveMessagesTimelineRows(
  input: {
    timelineEntries: ReadonlyArray<TimelineEntry>;
    pendingApprovalRequestIds?: ReadonlySet<RuntimeRequestId>;
    latestRun?: TimelineLatestRun | null;
    runningRunId?: RunId | null;
    expandedRunIds?: ReadonlySet<RunId>;
    expandedAttemptIds?: ReadonlySet<RunAttemptId>;
    isWorking: boolean;
    /** Native subagent work has no app run; runless entries form the live response. */
    runlessWorkActive?: boolean;
    activeTurnStartedAt?: string | null;
    turnDiffSummaries: ReadonlyArray<TurnDiffSummary>;
    supportsConversationRollback: boolean;
    threadStartCheckpointAvailable?: boolean;
    availableRevertTurnCounts?: ReadonlySet<number> | undefined;
    worktreeSetup?: WorktreeSetupSnapshot | null;
    toolCallVisibility?: ToolCallVisibility;
    revealedMessageId?: MessageId | null;
  },
  resolve: MessageResolver = m,
): MessagesTimelineRow[] {
  const timelineEntries = timelineRowEntries(input);
  const embeddedResultRunIds = new Set<RunId>();
  for (const entry of timelineEntries) {
    if ((entry.kind === "html-render" || entry.kind === "mcp-app") && entry.runId !== null) {
      embeddedResultRunIds.add(entry.runId);
    }
  }
  const isPendingApproval = (entry: WorkLogEntry) => {
    const item = entry.projectedItem?.item;
    return (
      item?.type === "approval_request" &&
      input.pendingApprovalRequestIds?.has(item.requestId) === true
    );
  };
  const unsettledRunId = deriveUnsettledRunId(input.latestRun ?? null, input.runningRunId ?? null);
  const revertTurnCountByUserMessageId = input.supportsConversationRollback
    ? deriveRevertTurnCountByUserMessageId({
        timelineEntries: input.timelineEntries,
        checkpoints: input.turnDiffSummaries,
        threadStartCheckpointAvailable: input.threadStartCheckpointAvailable === true,
        unsettledRunId,
        availableRevertTurnCounts: input.availableRevertTurnCounts,
      })
    : new Map<MessageId, number>();
  const nextRows: MessagesTimelineRow[] = [];
  const terminalAssistantMessageIds = deriveTerminalAssistantMessageIds(timelineEntries);
  const failedRunIds = failedTimelineRunIds(timelineEntries, input.latestRun ?? null);
  const liveSubagentEntryIds = liveSubagentCardEntryIds(timelineEntries);
  const retainedAssistantReplyIds = retainedAssistantReplyEntryIds(timelineEntries);
  const supersededFoldsByAnchorEntryId = deriveSupersededAttemptFolds(
    timelineEntries,
    failedRunIds,
    liveSubagentEntryIds,
    retainedAssistantReplyIds,
  );
  const supersededWorkItemIds = new Set(
    [...supersededFoldsByAnchorEntryId.values()].flatMap((fold) => fold.deferredWorkItemIds),
  );
  const activeVisualResponseRunIds = deriveActiveVisualResponseRunIds({
    timelineEntries: timelineEntries,
    unsettledRunId,
    isWorking: input.isWorking,
  });
  const runlessWorkActive = input.isWorking && input.runlessWorkActive === true;
  const zen = input.toolCallVisibility === "zen";
  const derivedFolds = deriveTurnFolds({
    timelineEntries,
    terminalAssistantMessageIds,
    latestRun: input.latestRun ?? null,
    failedRunIds,
    liveRunId: liveTurnRunId(input),
    runlessLive: runlessWorkActive,
    liveSubagentEntryIds,
    retainedAssistantReplyEntryIds: retainedAssistantReplyIds,
    pendingApprovalRequestIds: input.pendingApprovalRequestIds,
    resolve,
  });
  const timelineEntryById = new Map(timelineEntries.map((entry) => [entry.id, entry]));
  const workOf = (entry: Extract<TimelineEntry, { kind: "work" }>) => {
    const status = derivedFolds.settledStatusByEntryId.get(entry.id);
    return status === undefined ? entry.entry : settledWorkEntry(entry.entry, status);
  };
  const runIdIsActiveResponse = (runId: RunId | null | undefined) =>
    runId == null ? runlessWorkActive : activeVisualResponseRunIds.has(runId);
  const workEntryIsInActiveRun = (entry: WorkLogEntry) =>
    input.isWorking &&
    entry.toolLifecycleStatus === "inProgress" &&
    (entry.runId == null ? runlessWorkActive : entry.runId === unsettledRunId);
  // One rule for what an open island lists, what makes it foldable, and what it counts.
  const entryRenders = (entry: TimelineEntry) => {
    if (entry.kind !== "work") return true;
    const work = workOf(entry);
    return workEntryIsVisibleInGroup(work, workEntryIsInActiveRun(work));
  };

  const activeTurnHeaderIndex = input.isWorking
    ? lastResponseBoundaryIndex(timelineEntries) + 1
    : timelineEntries.length;

  // A bare `/compact` turn is the compaction itself: one compaction row stands in for its prompt
  // and its island, from the moment the turn starts. Likewise an answered "compact before
  // continuing?" question folds into the compaction it asked for.
  const compactionRuns = new Map<RunId, OrchestrationV2IdleCompaction | undefined>();
  const compactedRunIds = new Set<RunId>();
  const pendingResumeCompactionAgeByRunId = new Map<RunId, string>();
  const resumeCompactionAgeByEntryId = new Map<string, string>();
  for (const entry of timelineEntries) {
    if (
      entry.kind === "message" &&
      entry.message.runId !== null &&
      isCompactionCommandMessage(entry.message)
    ) {
      compactionRuns.set(entry.message.runId, idleCompactionOf(entry.message));
    } else if (entry.kind === "work" && entry.entry.runId) {
      if (timelineEntryIsCompaction(entry)) {
        compactedRunIds.add(entry.entry.runId);
        const age = pendingResumeCompactionAgeByRunId.get(entry.entry.runId);
        if (age !== undefined) {
          resumeCompactionAgeByEntryId.set(entry.id, age);
          pendingResumeCompactionAgeByRunId.delete(entry.entry.runId);
        }
      }
      const age = entry.entry.questionAnswer
        ? claudeResumeCompactionAge(entry.entry.questionAnswer)
        : null;
      if (age !== null) pendingResumeCompactionAgeByRunId.set(entry.entry.runId, age);
    }
  }
  const compactionTitle = (runId: RunId | null | undefined, entryId: string) => {
    if (runId == null) return undefined;
    const reason = compactionRuns.get(runId);
    if (reason !== undefined) return resolve(IDLE_COMPACTION_TITLES[reason]);
    const age = resumeCompactionAgeByEntryId.get(entryId);
    return age ? resolve(msg("Context compacted after {age} idle", { age })) : undefined;
  };
  const activeCompactionEntry = timelineEntries.find(
    (entry): entry is Extract<TimelineEntry, { kind: "work" }> =>
      timelineEntryIsCompaction(entry) &&
      entry.kind === "work" &&
      workEntryIsInActiveRun(entry.entry),
  );
  const activeRunIsCompaction =
    input.isWorking && unsettledRunId !== null && compactionRuns.has(unsettledRunId);
  // The item can finish before its run settles; only other work should keep activity visible.
  const compactionRunFinished =
    activeRunIsCompaction &&
    compactedRunIds.has(unsettledRunId) &&
    activeCompactionEntry === undefined;
  const compactionOnlyRunFinished =
    compactionRunFinished &&
    !timelineEntries.some(
      (entry) =>
        timelineEntryRunId(entry) === unsettledRunId &&
        !timelineEntryIsCompaction(entry) &&
        !(entry.kind === "message" && isCompactionCommandMessage(entry.message)),
    );
  const runningCompactionRunId =
    activeRunIsCompaction && !compactionRunFinished ? unsettledRunId : null;
  // Compacting on return holds back the message the user just sent, so the island says why it
  // is waiting. Any other compaction run shows only its live divider, never both.
  const compactsOnReturn =
    runningCompactionRunId !== null && compactionRuns.get(runningCompactionRunId) === "onReturn";
  // The question is answered mid-turn, so the island times this compaction, not the turn.
  const resumeCompactionEntry =
    activeCompactionEntry?.entry.runId != null &&
    resumeCompactionAgeByEntryId.has(activeCompactionEntry.id)
      ? activeCompactionEntry
      : undefined;
  const activeCompactionRunId = compactsOnReturn
    ? runningCompactionRunId
    : (resumeCompactionEntry?.entry.runId ?? null);

  // The island is the running turn's header: it shows what the turn does now and folds the rest.
  const answeredRunId =
    input.latestRun && (input.latestRun.turnEnded === true || input.latestRun.completedAt !== null)
      ? input.latestRun.runId
      : null;
  const latestRunAnswered =
    answeredRunId !== null &&
    timelineEntries.findLastIndex((entry) => timelineEntryRunId(entry) === answeredRunId) >=
      activeTurnHeaderIndex;
  const liveIslandSuppressed =
    compactionOnlyRunFinished ||
    (runningCompactionRunId !== null && activeCompactionRunId === null);
  // Other compactions show their live divider, so the island does not repeat them.
  const liveCompacting = activeCompactionRunId !== null;
  const waitingOn =
    unsettledRunId === null ? 0 : runningSubagentsAtRunTail(input.timelineEntries, unsettledRunId);
  const approvalPending = (input.pendingApprovalRequestIds?.size ?? 0) > 0;
  const liveStartedAt =
    (compactsOnReturn ? undefined : resumeCompactionEntry?.entry.createdAt) ??
    (input.latestRun?.runId === unsettledRunId ? input.latestRun?.startedAt : null) ??
    input.activeTurnStartedAt ??
    null;
  // Tool visibility can filter out work that came after the answer; the unfiltered entries know.
  const hiddenWorkFollows = (answer: TimelineEntry) => {
    const runId = timelineEntryRunId(answer);
    const index = input.timelineEntries.findIndex((entry) => entry.id === answer.id);
    return input.timelineEntries
      .slice(index + 1)
      .some((entry) => entry.kind === "work" && timelineEntryRunId(entry) === runId);
  };
  const liveIslandFor = (fold: TurnFold | null): TurnFoldLive | null => {
    if (liveIslandSuppressed) return null;
    const hidden = fold?.hiddenEntryIds ?? new Set<string>();
    const answer = fold?.answerEntryId ? timelineEntryById.get(fold.answerEntryId) : undefined;
    const foldsSomething = (fold?.entries ?? []).some(
      (entry) => hidden.has(entry.id) && entryRenders(entry),
    );
    // A plain answer needs no island once it shows, unless work it hides still follows it.
    if (
      !foldsSomething &&
      answer !== undefined &&
      !liveCompacting &&
      waitingOn === 0 &&
      !approvalPending &&
      !hiddenWorkFollows(answer)
    ) {
      return null;
    }
    const folded = (fold?.entries ?? []).filter((entry) => hidden.has(entry.id));
    let runningTool: WorkLogEntry | undefined;
    let runningThought: WorkLogEntry | undefined;
    let latestWork: WorkLogEntry | undefined;
    for (const entry of folded) {
      if (entry.kind === "message" && entry.message.role === "assistant") latestWork = undefined;
      if (entry.kind !== "work") continue;
      const work = workOf(entry);
      if (!workEntryIsVisibleInGroup(work, true)) continue;
      // A request gates the tool call that asked for it; the call is the step.
      if (workEntryIsRequest(work)) continue;
      latestWork = work;
      // A superseded attempt's work is over even when it never said so.
      if (entry.attempt?.status === "superseded") continue;
      if (work.itemType === "reasoning") {
        if (work.toolLifecycleStatus === "inProgress") runningThought = work;
      } else if (
        workEntryIsIslandStep(work) &&
        workEntryIsActiveTurnActivity(work) &&
        // A plan stays in progress while any task is open; it must not take over between tool calls.
        work.structuredPayload?.type !== "todo_list"
      ) {
        runningTool = work;
      }
    }
    const captionEntry =
      answer === undefined
        ? folded.findLast(
            (entry) =>
              (entry.kind === "work" &&
                entry.entry.itemType === "reasoning" &&
                Boolean(entry.entry.detail?.trim())) ||
              (entry.kind === "message" &&
                entry.message.role === "assistant" &&
                Boolean(entry.message.text.trim())),
          )
        : undefined;
    const base = {
      startedAt: fold?.steeredAt ?? liveStartedAt,
      ...(captionEntry === undefined
        ? {}
        : {
            caption: {
              id: captionEntry.id,
              text:
                captionEntry.kind === "work"
                  ? (captionEntry.entry.detail ?? "")
                  : captionEntry.kind === "message"
                    ? captionEntry.message.text
                    : "",
            },
          }),
    };
    if (liveCompacting) return { ...base, activity: "compacting" };
    if (waitingOn > 0) {
      return { ...base, activity: "thinking", label: waitingOnSubagentsLabel(waitingOn, resolve) };
    }
    if (approvalPending) return { ...base, activity: "approval" };
    if (runningTool) return { ...base, activity: "step", step: runningTool };
    if (runningThought) return { ...base, activity: "thinking", thoughtId: runningThought.id };
    // Writing until newer work starts, whether or not the message still streams.
    if (answer?.kind === "message" && !hiddenWorkFollows(answer)) {
      return { ...base, activity: "writing" };
    }
    if (latestWork && latestWork.itemType !== "reasoning" && workEntryIsIslandStep(latestWork)) {
      return { ...base, activity: "step", step: latestWork };
    }
    return { ...base, activity: "thinking" };
  };

  // Zen keeps only the live island, with nothing folded into it.
  const foldsByAnchorEntryId = new Map<string, TurnFold>();
  let liveFold: TurnFold | null = null;
  for (const [anchorEntryId, fold] of derivedFolds.foldsByAnchorEntryId) {
    if (fold.live) {
      liveFold = zen ? { ...fold, hiddenEntryIds: new Set(), answerEntryId: null } : fold;
    } else if (!zen) {
      foldsByAnchorEntryId.set(anchorEntryId, fold);
    }
  }
  const liveIsland = input.isWorking ? liveIslandFor(liveFold) : null;
  const foldsAfterEntryId = new Map<string, TurnFold>();
  if (liveFold !== null && liveIsland !== null) {
    (liveFold.afterAnchor ? foldsAfterEntryId : foldsByAnchorEntryId).set(
      liveFold.anchorEntryId,
      liveFold,
    );
  }
  const showsPendingIsland =
    input.isWorking && liveFold === null && liveIsland !== null && !latestRunAnswered;

  const collapsedEntryIds = new Set<string>();
  const collapsedFoldMemberIds = new Set<string>();
  const openFoldByEntryId = new Map<string, RunId>();
  for (const fold of foldsByAnchorEntryId.values()) {
    if (input.expandedRunIds?.has(fold.runId)) {
      for (const entryId of fold.hiddenEntryIds) openFoldByEntryId.set(entryId, fold.runId);
      continue;
    }
    for (const entryId of fold.hiddenEntryIds) collapsedEntryIds.add(entryId);
    for (const entryId of fold.entryIds) collapsedFoldMemberIds.add(entryId);
  }
  const collapsedSupersededEntryIds = new Set<string>();
  for (const fold of supersededFoldsByAnchorEntryId.values()) {
    if (!input.expandedAttemptIds?.has(fold.attemptId)) {
      for (const entryId of fold.hiddenEntryIds) {
        collapsedSupersededEntryIds.add(entryId);
      }
    }
  }
  if (input.pendingApprovalRequestIds?.size) {
    for (const entry of timelineEntries) {
      if (entry.kind === "work" && isPendingApproval(entry.entry)) {
        collapsedSupersededEntryIds.delete(entry.id);
      }
    }
  }
  const foldRowCounts = new Map<RunId, number>();
  const foldPosition = (entryId: string, count: number) => {
    const runId = openFoldByEntryId.get(entryId);
    if (runId === undefined) return {};
    const index = foldRowCounts.get(runId) ?? 0;
    foldRowCounts.set(runId, index + count);
    return { fold: { runId, index } };
  };

  const turnFoldRow = (
    fold: TurnFold | null,
    live: TurnFoldLive | null,
  ): Extract<MessagesTimelineRow, { kind: "turn-fold" }> => {
    const runId = fold?.runId ?? derivedFolds.liveKey ?? PENDING_TURN_FOLD_RUN_ID;
    let stepCount = 0;
    const filmSteps: WorkLogEntry[] = [];
    const deferredWorkItemIds: string[] = [];
    // A deferred history anchor stands for its whole group; loaded members are already in it.
    const deferredRanges: Array<{
      readonly from: number;
      readonly to: number;
      readonly attemptId: string | undefined;
    }> = [];
    // The server's membership: a completed deferrable item of the anchor's attempt.
    const isDeferredMember = (entry: Extract<TimelineEntry, { kind: "work" }>, ordinal: number) => {
      const item = entry.entry.projectedItem?.item;
      return (
        item?.status === "completed" &&
        DEFERRED_WORK_ITEM_TYPES.has(item.type) &&
        entry.entry.viewedImagePath === undefined &&
        deferredRanges.some(
          (range) =>
            ordinal > range.from && ordinal <= range.to && range.attemptId === entry.attempt?.id,
        )
      );
    };
    for (const entry of fold?.entries ?? []) {
      if (entry.kind !== "work") continue;
      const item = entry.entry.projectedItem;
      const deferred = item?.item.deferredWork;
      if (deferred && !supersededWorkItemIds.has(String(item.sourceItemId))) {
        deferredWorkItemIds.push(String(item.sourceItemId));
      }
      if (!fold?.hiddenEntryIds.has(entry.id) || !entryRenders(entry)) continue;
      const work = workOf(entry);
      const ordinal = item?.item.ordinal;
      if (workEntryIsIslandStep(work)) {
        if (ordinal !== undefined && deferred) {
          stepCount += deferred.itemCount;
          deferredRanges.push({
            from: ordinal,
            to: deferred.lastOrdinal,
            attemptId: entry.attempt?.id,
          });
        } else if (ordinal === undefined || !isDeferredMember(entry, ordinal)) {
          stepCount += 1;
        }
      }
      // The island names its current step, so the film shows only the ones before it.
      if (workEntryIsFilmStep(work) && work.id !== live?.step?.id) filmSteps.push(work);
    }
    const film = filmSteps.slice(-FILM_STEP_LIMIT);
    return {
      kind: "turn-fold",
      id: `turn-fold:${runId}`,
      ...(deferredWorkItemIds.length > 0 ? { deferredWorkItemIds } : {}),
      createdAt:
        fold?.createdAt ??
        input.activeTurnStartedAt ??
        timelineEntries[activeTurnHeaderIndex - 1]?.createdAt ??
        "",
      runId,
      expanded: input.expandedRunIds?.has(runId) ?? false,
      stepCount,
      foldable: (fold?.entries ?? []).some(
        (entry) => fold?.hiddenEntryIds.has(entry.id) === true && entryRenders(entry),
      ),
      duration: fold?.duration ?? null,
      ...(fold?.outcome ? { outcome: fold.outcome } : {}),
      film,
      filmHiddenCount: filmSteps.length - film.length,
      ...(live === null ? {} : { live }),
    };
  };
  const appendFoldAfter = (entry: TimelineEntry | undefined) => {
    const fold = entry === undefined ? undefined : foldsAfterEntryId.get(entry.id);
    if (fold) nextRows.push(turnFoldRow(fold, liveIsland));
  };
  let pendingIslandShown = false;
  const appendPendingIsland = () => {
    if (!showsPendingIsland || pendingIslandShown) return;
    pendingIslandShown = true;
    nextRows.push(turnFoldRow(null, liveIsland));
  };

  for (let index = 0; index < timelineEntries.length; index += 1) {
    const timelineEntry = timelineEntries[index];
    if (!timelineEntry) {
      continue;
    }

    if (index === activeTurnHeaderIndex) {
      appendPendingIsland();
    }
    appendFoldAfter(timelineEntries[index - 1]);

    // Before any skip below: a skipped entry can still anchor its turn's island.
    const turnFold = foldsByAnchorEntryId.get(timelineEntry.id);
    if (turnFold) {
      nextRows.push(turnFoldRow(turnFold, turnFold.live ? liveIsland : null));
    }

    // A stopped compaction's own divider already says it stopped.
    if (
      timelineEntry.kind === "event" &&
      (timelineEntry.projectedItem.item.type === "run_interrupt_request" ||
        (timelineEntry.projectedItem.item.type === "run_interrupt_result" &&
          timelineEntry.projectedItem.item.runId !== null &&
          compactionRuns.has(timelineEntry.projectedItem.item.runId) &&
          compactedRunIds.has(timelineEntry.projectedItem.item.runId)))
    ) {
      continue;
    }

    if (collapsedEntryIds.has(timelineEntry.id)) {
      continue;
    }

    const supersededFold = supersededFoldsByAnchorEntryId.get(timelineEntry.id);
    if (supersededFold) {
      nextRows.push({
        kind: "attempt-fold",
        deferredWorkItemIds: supersededFold.deferredWorkItemIds,
        id: `attempt-fold:${supersededFold.attemptId}`,
        createdAt: supersededFold.createdAt,
        runId: supersededFold.runId,
        attemptId: supersededFold.attemptId,
        label: resolve(msg("Superseded attempt")),
        expanded: input.expandedAttemptIds?.has(supersededFold.attemptId) ?? false,
      });
    }

    if (collapsedSupersededEntryIds.has(timelineEntry.id)) {
      continue;
    }

    if (
      timelineEntry.kind === "work" &&
      timelineEntry.entry.sourceActivityKind === "context-compaction"
    ) {
      const active = workEntryIsInActiveRun(timelineEntry.entry);
      if (
        active &&
        activeCompactionRunId !== null &&
        timelineEntry.entry.runId === activeCompactionRunId
      )
        continue;
      const compaction = timelineEntry.entry.structuredPayload;
      const compactionRunId = timelineEntry.entry.runId;
      const title = compactionTitle(compactionRunId, timelineEntry.id);
      const reason = compactionRunId == null ? undefined : compactionRuns.get(compactionRunId);
      const failed = compaction?.type === "compaction" && compaction.status === "failed";
      const failure = failed ? compaction.summary?.trim() || undefined : undefined;
      const compacted =
        !(active && reason) &&
        compaction?.type === "compaction" &&
        compaction.status !== "failed" &&
        compaction.status !== "cancelled" &&
        compaction.status !== "interrupted" &&
        !isOrchestrationV2WorkActive(compaction.status);
      nextRows.push({
        kind: "context-compaction",
        id: timelineEntry.id,
        ...(title ? { title } : {}),
        ...(compacted ? { compacted: true } : {}),
        ...(failed ? { failed: true } : {}),
        ...(failure ? { failure } : {}),
        createdAt: timelineEntry.createdAt,
        label:
          active && reason ? resolve(IDLE_COMPACTING_LABELS[reason]) : timelineEntry.entry.label,
        tokenCounts:
          compaction?.type === "compaction" ? contextCompactionTokenCounts(compaction) : null,
        active,
      });
      continue;
    }

    if (
      timelineEntry.kind === "work" &&
      timelineEntry.entry.runId != null &&
      compactedRunIds.has(timelineEntry.entry.runId) &&
      timelineEntry.entry.questionAnswer !== undefined &&
      claudeResumeCompactionAge(timelineEntry.entry.questionAnswer) !== null
    ) {
      continue;
    }

    if (timelineEntry.kind === "work") {
      if (workEntryIsStandalone(timelineEntry.entry, isPendingApproval)) {
        nextRows.push({
          kind: "work",
          id: timelineEntry.id,
          createdAt: timelineEntry.createdAt,
          groupedEntries: [timelineEntry.entry],
          isExpandedToolGroup: false,
          ...foldPosition(timelineEntry.id, 1),
        });
        continue;
      }
      // Consecutive steps render as one flat list; the island above already summarizes them.
      const groupedEntries = [workOf(timelineEntry)];
      let cursor = index + 1;
      while (cursor < timelineEntries.length) {
        const nextEntry = timelineEntries[cursor];
        if (
          !nextEntry ||
          nextEntry.kind !== "work" ||
          nextEntry.entry.sourceActivityKind === "context-compaction" ||
          workEntryIsStandalone(nextEntry.entry, isPendingApproval) ||
          collapsedEntryIds.has(nextEntry.id) ||
          collapsedSupersededEntryIds.has(nextEntry.id) ||
          foldsByAnchorEntryId.has(nextEntry.id) ||
          supersededFoldsByAnchorEntryId.has(nextEntry.id) ||
          openFoldByEntryId.get(nextEntry.id) !== openFoldByEntryId.get(timelineEntry.id) ||
          (nextEntry.entry.runId ?? null) !== (timelineEntry.entry.runId ?? null) ||
          nextEntry.attempt?.id !== timelineEntry.attempt?.id
        ) {
          break;
        }
        groupedEntries.push(workOf(nextEntry));
        cursor += 1;
      }
      const visibleGroupedEntries = groupedEntries.filter((entry) =>
        workEntryIsVisibleInGroup(entry, workEntryIsInActiveRun(entry)),
      );
      if (visibleGroupedEntries.length > 0) {
        const rowId = `steps:${timelineEntry.id}`;
        nextRows.push({
          kind: "work",
          id: rowId,
          createdAt: timelineEntry.createdAt,
          groupedEntries: visibleGroupedEntries,
          isExpandedToolGroup: true,
          ...foldPosition(timelineEntry.id, visibleGroupedEntries.length),
        });
        nextRows.push(...viewedImagesRows(rowId, timelineEntry.createdAt, visibleGroupedEntries));
      }
      index = cursor - 1;
      continue;
    }

    if (timelineEntry.kind === "proposed-plan") {
      nextRows.push({
        kind: "proposed-plan",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        proposedPlan: timelineEntry.proposedPlan,
      });
      continue;
    }

    if (timelineEntry.kind === "html-render") {
      nextRows.push({
        kind: "html-render",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        htmlRender: timelineEntry.htmlRender,
      });
      continue;
    }

    if (timelineEntry.kind === "sent-message") {
      nextRows.push({
        kind: "sent-message",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        text: timelineEntry.text,
      });
      continue;
    }

    if (timelineEntry.kind === "mcp-app") {
      nextRows.push({
        kind: "mcp-app",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        sourceThreadId: timelineEntry.sourceThreadId,
        itemId: timelineEntry.itemId,
        revision: timelineEntry.revision,
        mcpApp: timelineEntry.mcpApp,
      });
      continue;
    }

    if (timelineEntry.kind === "event") {
      const previous = nextRows.at(-1);
      if (
        timelineEntry.projectedItem.item.type === "subagent" &&
        previous?.kind === "event" &&
        previous.projectedItem.item.type === "subagent" &&
        previous.projectedItem.item.runId === timelineEntry.projectedItem.item.runId &&
        previous.projectedItem.item.providerTurnId ===
          timelineEntry.projectedItem.item.providerTurnId
      ) {
        nextRows[nextRows.length - 1] = {
          ...previous,
          subagents: [
            ...(previous.subagents ?? [previous.projectedItem]),
            timelineEntry.projectedItem,
          ],
        };
        continue;
      }
      nextRows.push({
        kind: "event",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        projectedItem: timelineEntry.projectedItem,
      });
      continue;
    }

    const compactionRunId = timelineEntry.message.runId;
    const compactionRun =
      compactionRunId !== null && isCompactionCommandMessage(timelineEntry.message);
    if (compactionRun) {
      if (!compactedRunIds.has(compactionRunId) && compactionRunId !== activeCompactionRunId) {
        const pending = compactionRunId === runningCompactionRunId;
        const reason = compactionRuns.get(compactionRunId);
        nextRows.push({
          kind: "context-compaction",
          id: `compaction:${compactionRunId}`,
          createdAt: timelineEntry.createdAt,
          label: pending
            ? reason
              ? resolve(IDLE_COMPACTING_LABELS[reason])
              : resolve(msg("Compacting context"))
            : resolve(msg("Context compaction")),
          tokenCounts: null,
          active: pending,
        });
      }
      continue;
    }

    const assistantResponseStillInProgress =
      timelineEntry.message.role === "assistant" &&
      runIdIsActiveResponse(timelineEntry.message.runId);

    const showAssistantMeta =
      timelineEntry.message.role === "assistant" &&
      terminalAssistantMessageIds.has(timelineEntry.message.id) &&
      !assistantResponseStillInProgress;

    nextRows.push({
      kind: "message",
      id: timelineEntry.id,
      createdAt: timelineEntry.createdAt,
      message: timelineEntry.message,
      ...(timelineEntry.projectedItem === undefined
        ? {}
        : { projectedItem: timelineEntry.projectedItem }),
      showAssistantMeta,
      suppressEmptyResponse:
        timelineEntry.message.role === "assistant" &&
        timelineEntry.message.runId != null &&
        embeddedResultRunIds.has(timelineEntry.message.runId),
      showAssistantCopyButton: showAssistantMeta,
      assistantCopyStreaming: timelineEntry.message.streaming || assistantResponseStillInProgress,
      revertTurnCount:
        timelineEntry.message.role === "user"
          ? revertTurnCountByUserMessageId.get(timelineEntry.message.id)
          : undefined,
      ...foldPosition(timelineEntry.id, 1),
    });
  }
  if (activeTurnHeaderIndex === timelineEntries.length) appendPendingIsland();
  appendFoldAfter(timelineEntries.at(-1));

  const setupHandedOff =
    input.worktreeSetup !== null &&
    input.worktreeSetup !== undefined &&
    worktreeSetupAgentStarted(input.worktreeSetup) &&
    input.latestRun?.startedAt != null;
  const setupOwnsIslandSlot =
    !setupHandedOff &&
    (input.worktreeSetup?.phase === "running" || input.worktreeSetup?.phase === "done");
  if (input.worktreeSetup && (!setupHandedOff || input.worktreeSetup.phase !== "running")) {
    const setupRow = {
      kind: "worktree-setup",
      id: WORKTREE_SETUP_ROW_ID,
      createdAt: input.worktreeSetup.startedAt,
      snapshot: input.worktreeSetup,
      embedded: setupHandedOff,
    } as const;
    const firstUserRowIndex = nextRows.findIndex(
      (row) => row.kind === "message" && row.message.role === "user",
    );
    const islandRowIndex = setupOwnsIslandSlot
      ? nextRows.findIndex((row) => row.kind === "turn-fold" && row.live !== undefined)
      : -1;
    if (islandRowIndex >= 0) {
      nextRows.splice(islandRowIndex + 1, 0, setupRow);
    } else {
      const insertAt = firstUserRowIndex >= 0 ? firstUserRowIndex + 1 : nextRows.length;
      nextRows.splice(
        insertAt,
        0,
        ...(setupOwnsIslandSlot
          ? [
              turnFoldRow(null, {
                startedAt: input.worktreeSetup.startedAt,
                activity: "thinking",
              }),
              setupRow,
            ]
          : [setupRow]),
      );
    }
  }

  const result = attachTrailingToolGroupsToAssistant(
    attachCreatedThreadSummaries(nextRows, timelineEntries, collapsedFoldMemberIds),
  );
  return result.map((row, index) => {
    if (timelineRowIsWorkLog(row) && timelineRowIsWorkLog(result[index + 1])) {
      return { ...row, continuesWorkLog: true };
    }
    if (!timelineRowIsOwnUserMessage(row)) return row;
    const previous = result[index - 1];
    const groupedWithNext = timelineRowIsOwnUserMessage(result[index + 1]);
    const groupedWithPrevious = timelineRowIsOwnUserMessage(previous);
    const continuesSteer =
      groupedWithPrevious && messageIsSteer(row.message) && messageIsSteer(previous.message);
    if (!groupedWithNext && !groupedWithPrevious) return row;
    return { ...row, groupedWithNext, groupedWithPrevious, continuesSteer };
  });
}

function timelineRowIsOwnUserMessage(
  row: MessagesTimelineRow | undefined,
): row is Extract<MessagesTimelineRow, { kind: "message" }> {
  return (
    row?.kind === "message" &&
    row.message.role === "user" &&
    resolveUserMessagePresentation(row.message).attribution === null
  );
}

function messageIsSteer(message: ChatMessage): boolean {
  return message.inputIntent === "steer" || message.inputIntent === "promoted_queued_to_steer";
}

function timelineRowIsWorkLog(row: MessagesTimelineRow | undefined): boolean {
  return row?.kind === "work";
}

function attachCreatedThreadSummaries(
  rows: MessagesTimelineRow[],
  timelineEntries: ReadonlyArray<TimelineEntry>,
  collapsedFoldMemberIds: ReadonlySet<string>,
): MessagesTimelineRow[] {
  const terminalIndexes = new Map<RunId, number>();
  const createdByRun = new Map<RunId, Array<Extract<MessagesTimelineRow, { kind: "event" }>>>();
  for (const [index, row] of rows.entries()) {
    if (row.kind === "message" && row.showAssistantMeta && row.message.runId) {
      terminalIndexes.set(row.message.runId, index);
    }
  }
  for (const entry of timelineEntries) {
    const projectedItem =
      entry.kind === "work"
        ? entry.entry.projectedItem
        : entry.kind === "event"
          ? entry.projectedItem
          : undefined;
    if (projectedItem?.item.type === "thread_created" && projectedItem.item.runId) {
      const runId = projectedItem.item.runId;
      const entries = createdByRun.get(runId) ?? [];
      entries.push({ kind: "event", id: entry.id, createdAt: entry.createdAt, projectedItem });
      createdByRun.set(runId, entries);
    }
  }
  return rows.flatMap((row, index): MessagesTimelineRow[] => {
    if (row.kind === "event" && row.projectedItem.item.type === "thread_created") {
      const runId = row.projectedItem.item.runId;
      const terminalIndex = runId === null ? undefined : terminalIndexes.get(runId);
      if (
        terminalIndex !== undefined &&
        (collapsedFoldMemberIds.has(row.id) || index > terminalIndex)
      )
        return [];
    }
    if (row.kind === "message" && row.showAssistantMeta && row.message.runId) {
      return [
        row,
        ...(createdByRun.get(row.message.runId) ?? []).map((entry) => ({
          ...entry,
          id: `summary:${entry.id}`,
          resourceSummary: true,
        })),
      ];
    }
    return [row];
  });
}

const WORKTREE_SETUP_ROW_ID = "worktree-setup-row";

export type MessagesTimelineRowsInput = Parameters<typeof deriveMessagesTimelineRows>[0];

interface MessagesTimelineRowsProjection {
  readonly input: MessagesTimelineRowsInput;
  readonly rows: MessagesTimelineRow[];
}

/**
 * Runless (imported V1) turns and work after a steer fold under synthetic
 * keys, so the entry's own run id is not enough to open them.
 */
export function timelineTurnFoldRunIdsByEntryId(
  input: Pick<
    MessagesTimelineRowsInput,
    | "timelineEntries"
    | "latestRun"
    | "isWorking"
    | "runlessWorkActive"
    | "runningRunId"
    | "toolCallVisibility"
    | "revealedMessageId"
    | "pendingApprovalRequestIds"
  >,
): ReadonlyMap<string, RunId> {
  const byEntryId = new Map<string, RunId>();
  for (const fold of deriveTimelineTurnFolds(input).values()) {
    for (const entryId of fold.hiddenEntryIds) byEntryId.set(entryId, fold.runId);
  }
  return byEntryId;
}

/** Whether a fold key belongs to the run: its own key or one of its post-steer segments. */
export function isRunFoldKey(key: RunId, runId: RunId): boolean {
  return key === runId || key.startsWith(`${runId}:steer:`);
}

/** The key of the run's last folded segment, where its latest work sits. */
export function finalRunFoldKey(foldRunIds: ReadonlyMap<string, RunId>, runId: RunId): RunId {
  let final = runId;
  for (const key of foldRunIds.values()) if (isRunFoldKey(key, runId)) final = key;
  return final;
}

function sameCheckpointSummaries(
  previous: MessagesTimelineRowsInput["turnDiffSummaries"],
  next: MessagesTimelineRowsInput["turnDiffSummaries"],
): boolean {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  for (const [index, summary] of previous.entries()) {
    if (!shallow(summary, next[index])) return false;
  }
  return true;
}

function replaceStreamingMessageRows(
  input: MessagesTimelineRowsInput,
  previous: MessagesTimelineRowsProjection,
): MessagesTimelineRow[] | null {
  const {
    timelineEntries: previousEntries,
    latestRun: previousRun,
    turnDiffSummaries: previousCheckpoints,
    expandedRunIds: previousExpandedRuns,
    expandedAttemptIds: previousExpandedAttempts,
    pendingApprovalRequestIds: previousPendingApprovalRequestIds,
    availableRevertTurnCounts: previousAvailableRevertTurnCounts,
    ...previousContext
  } = previous.input;
  const {
    timelineEntries,
    latestRun,
    turnDiffSummaries,
    expandedRunIds,
    expandedAttemptIds,
    pendingApprovalRequestIds,
    availableRevertTurnCounts,
    ...context
  } = input;
  // Shell/checkpoint selectors rebuild summaries per event; compare contents.
  if (
    timelineEntries.length !== previousEntries.length ||
    !shallow(previousContext, context) ||
    !shallow(previousRun, latestRun) ||
    !shallow(previousExpandedRuns, expandedRunIds) ||
    !shallow(previousExpandedAttempts, expandedAttemptIds) ||
    !shallow(previousPendingApprovalRequestIds, pendingApprovalRequestIds) ||
    !shallow(previousAvailableRevertTurnCounts, availableRevertTurnCounts) ||
    !sameCheckpointSummaries(previousCheckpoints, turnDiffSummaries)
  ) {
    return null;
  }
  const replacements = new Map<ChatMessage, Extract<TimelineEntry, { kind: "message" }>>();
  const thoughts = new Map<string, WorkLogEntry>();
  const plans = new Map<string, ProposedPlan>();
  for (let index = 0; index < timelineEntries.length; index += 1) {
    const entry = timelineEntries[index]!;
    const previousEntry = previousEntries[index]!;
    if (entry === previousEntry) continue;
    if (
      entry.kind !== previousEntry.kind ||
      entry.id !== previousEntry.id ||
      entry.createdAt !== previousEntry.createdAt ||
      entry.attempt !== previousEntry.attempt
    ) {
      return null;
    }
    if (entry.kind === "work" && previousEntry.kind === "work") {
      if (!isStreamingThoughtUpdate(previousEntry.entry, entry.entry)) return null;
      thoughts.set(entry.id, entry.entry);
      continue;
    }
    if (entry.kind === "proposed-plan" && previousEntry.kind === "proposed-plan") {
      const { planMarkdown: _before, updatedAt: _beforeAt, ...before } = previousEntry.proposedPlan;
      const { planMarkdown: _after, updatedAt: _afterAt, ...after } = entry.proposedPlan;
      if (!shallow(before, after)) return null;
      plans.set(entry.id, entry.proposedPlan);
      continue;
    }
    if (entry.kind !== "message" || previousEntry.kind !== "message") return null;
    if (
      entry.projectedItem !== previousEntry.projectedItem &&
      (entry.projectedItem === undefined ||
        previousEntry.projectedItem === undefined ||
        !isStreamingTurnItemTextUpdate(previousEntry.projectedItem, entry.projectedItem))
    ) {
      return null;
    }
    if (
      entry.message === previousEntry.message &&
      entry.projectedItem === previousEntry.projectedItem
    )
      continue;
    if (!isStreamingMessageTextUpdate(previousEntry.message, entry.message)) return null;
    // Folded commentary that gains or loses its text can become or stop being the caption.
    if (
      Boolean(previousEntry.message.text.trim()) !== Boolean(entry.message.text.trim()) &&
      !previous.rows.some((row) => row.kind === "message" && row.message === previousEntry.message)
    ) {
      return null;
    }
    replacements.set(previousEntry.message, entry);
  }
  if (replacements.size === 0 && thoughts.size === 0 && plans.size === 0) return previous.rows;
  // Rows settle superseded thinking after tool visibility filtering, which these entries
  // have not seen; the fast path keeps item status, so the row's settled status still holds.
  const patchedThoughts = new Map<WorkLogEntry, WorkLogEntry>();
  const patchThought = (entry: WorkLogEntry) => {
    const thought = thoughts.get(entry.id);
    if (!thought) return entry;
    let patched = patchedThoughts.get(entry);
    if (!patched) {
      patched =
        entry.toolLifecycleStatus === thought.toolLifecycleStatus ||
        entry.toolLifecycleStatus === undefined
          ? thought
          : { ...thought, toolLifecycleStatus: entry.toolLifecycleStatus };
      patchedThoughts.set(entry, patched);
    }
    return patched;
  };
  const patchedGroups = new Map<WorkLogEntry[], WorkLogEntry[]>();
  const patchGroup = (group: WorkLogEntry[]) => {
    if (!group.some((entry) => thoughts.has(entry.id))) return group;
    const patched = patchedGroups.get(group) ?? group.map(patchThought);
    patchedGroups.set(group, patched);
    return patched;
  };
  const replacedMessageById = new Map(
    [...replacements.values()].map((entry) => [entry.id, entry.message]),
  );
  const patchedThoughtIds = new Set<string>();
  const rows = previous.rows.map((row): MessagesTimelineRow => {
    if (row.kind === "proposed-plan") {
      const proposedPlan = plans.get(row.id);
      return proposedPlan ? { ...row, proposedPlan } : row;
    }
    if (row.kind === "turn-fold") {
      const caption = row.live?.caption;
      if (!row.live || !caption) return row;
      const thought = thoughts.get(caption.id);
      const text = thought ? (thought.detail ?? "") : replacedMessageById.get(caption.id)?.text;
      if (text === undefined) return row;
      if (thought) patchedThoughtIds.add(caption.id);
      return { ...row, live: { ...row.live, caption: { ...caption, text } } };
    }
    if (row.kind === "work") {
      const groupedEntries = patchGroup(row.groupedEntries);
      if (groupedEntries === row.groupedEntries) return row;
      if (row.isExpandedToolGroup) {
        for (const entry of groupedEntries) {
          if (thoughts.has(entry.id)) patchedThoughtIds.add(entry.id);
        }
      }
      return { ...row, groupedEntries };
    }
    if (row.kind !== "message" && row.kind !== "assistant-meta") return row;
    const entry = replacements.get(row.message);
    return entry
      ? {
          ...row,
          message: entry.message,
          ...(entry.projectedItem === undefined ? {} : { projectedItem: entry.projectedItem }),
        }
      : row;
  });
  // Step lists and the island's caption show a thought's text as it streams; anything else
  // that holds a thought derives from more than its text, so it needs the full rebuild.
  for (const id of thoughts.keys()) if (!patchedThoughtIds.has(id)) return null;
  return rows;
}

/**
 * Rows read a thought's text only through its blankness (visibility, the live
 * thought line) and through labels that live rows do not store.
 */
function isStreamingThoughtUpdate(previous: WorkLogEntry, next: WorkLogEntry): boolean {
  if (
    previous.itemType !== "reasoning" ||
    previous.projectedItem === undefined ||
    next.projectedItem === undefined ||
    !isStreamingTurnItemTextUpdate(previous.projectedItem, next.projectedItem) ||
    Boolean(previous.detail?.trim()) !== Boolean(next.detail?.trim())
  ) {
    return false;
  }
  const {
    detail: _before,
    structuredPayload: _beforeItem,
    projectedItem: _beforeRow,
    ...rest
  } = previous;
  const {
    detail: _after,
    structuredPayload: _afterItem,
    projectedItem: _afterRow,
    ...nextRest
  } = next;
  return shallow(rest, nextRest);
}

export function deriveMessagesTimelineRowsWithState(
  input: MessagesTimelineRowsInput,
  previous: MessagesTimelineRowsProjection | null = null,
  resolve: MessageResolver = m,
): MessagesTimelineRowsProjection {
  return {
    input,
    rows:
      (previous === null ? null : replaceStreamingMessageRows(input, previous)) ??
      deriveMessagesTimelineRows(input, resolve),
  };
}

export function computeStableMessagesTimelineRows(
  rows: MessagesTimelineRow[],
  previous: StableMessagesTimelineRowsState,
): StableMessagesTimelineRowsState {
  const next = new Map<string, MessagesTimelineRow>();
  let anyChanged = rows.length !== previous.byId.size;

  const result = rows.map((row, index) => {
    const prevRow = previous.byId.get(row.id);
    const nextRow = prevRow && isRowUnchanged(prevRow, row) ? prevRow : row;
    next.set(row.id, nextRow);
    if (!anyChanged && previous.result[index] !== nextRow) {
      anyChanged = true;
    }
    return nextRow;
  });

  return anyChanged ? { byId: next, result } : previous;
}

function sameStrings(a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function sameFoldPosition(a: TurnFoldPosition | undefined, b: TurnFoldPosition | undefined) {
  return a?.runId === b?.runId && a?.index === b?.index;
}

function sameTurnFoldLive(a: TurnFoldLive | undefined, b: TurnFoldLive | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.startedAt === b.startedAt &&
    a.activity === b.activity &&
    a.thoughtId === b.thoughtId &&
    a.label === b.label &&
    a.caption?.id === b.caption?.id &&
    a.caption?.text === b.caption?.text &&
    Equal.equals(a.step, b.step)
  );
}

function isRowUnchanged(a: MessagesTimelineRow, b: MessagesTimelineRow): boolean {
  if (a.kind !== b.kind || a.id !== b.id) return false;

  switch (a.kind) {
    case "worktree-setup":
      return a.snapshot === (b as typeof a).snapshot;

    case "assistant-meta": {
      const bm = b as typeof a;
      return (
        a.createdAt === bm.createdAt &&
        a.projectedItem === bm.projectedItem &&
        a.message === bm.message &&
        a.showAssistantCopyButton === bm.showAssistantCopyButton &&
        a.assistantCopyStreaming === bm.assistantCopyStreaming
      );
    }

    case "attempt-fold": {
      const bf = b as typeof a;
      return (
        a.createdAt === bf.createdAt &&
        a.label === bf.label &&
        a.expanded === bf.expanded &&
        sameStrings(a.deferredWorkItemIds ?? [], bf.deferredWorkItemIds ?? [])
      );
    }

    case "turn-fold": {
      const bf = b as typeof a;
      return (
        a.createdAt === bf.createdAt &&
        a.expanded === bf.expanded &&
        a.stepCount === bf.stepCount &&
        a.foldable === bf.foldable &&
        a.duration === bf.duration &&
        a.outcome === bf.outcome &&
        a.filmHiddenCount === bf.filmHiddenCount &&
        Equal.equals(a.film, bf.film) &&
        sameTurnFoldLive(a.live, bf.live) &&
        sameStrings(a.deferredWorkItemIds ?? [], bf.deferredWorkItemIds ?? [])
      );
    }

    case "context-compaction": {
      const bc = b as typeof a;
      return (
        a.createdAt === bc.createdAt &&
        a.label === bc.label &&
        a.active === bc.active &&
        a.title === bc.title &&
        a.failed === bc.failed &&
        a.failure === bc.failure
      );
    }

    case "proposed-plan":
      return a.proposedPlan === (b as typeof a).proposedPlan;

    case "viewed-images": {
      const bv = b as typeof a;
      return (
        a.createdAt === bv.createdAt &&
        a.paths.length === bv.paths.length &&
        a.paths.every((path, index) => path === bv.paths[index])
      );
    }

    case "html-render": {
      // Tool updates rebuild entries; preserve frames for unchanged pages.
      const bh = b as typeof a;
      return a.createdAt === bh.createdAt && htmlRenderReferencesEqual(a.htmlRender, bh.htmlRender);
    }

    case "sent-message": {
      const bs = b as typeof a;
      return a.createdAt === bs.createdAt && a.text === bs.text;
    }

    case "mcp-app": {
      const bm = b as typeof a;
      return (
        a.createdAt === bm.createdAt &&
        a.revision === bm.revision &&
        mcpAppReferencesEqual(a.mcpApp, bm.mcpApp)
      );
    }

    case "event":
      return (
        a.projectedItem === (b as typeof a).projectedItem &&
        a.resourceSummary === (b as typeof a).resourceSummary &&
        Equal.equals(a.subagents, (b as typeof a).subagents)
      );

    case "work": {
      const bw = b as typeof a;
      return (
        a.isExpandedToolGroup === bw.isExpandedToolGroup &&
        sameFoldPosition(a.fold, bw.fold) &&
        Equal.equals(a.groupedEntries, bw.groupedEntries)
      );
    }

    case "message": {
      const bm = b as typeof a;
      return (
        a.message === bm.message &&
        a.projectedItem === bm.projectedItem &&
        a.showAssistantMeta === bm.showAssistantMeta &&
        a.suppressEmptyResponse === bm.suppressEmptyResponse &&
        a.showAssistantCopyButton === bm.showAssistantCopyButton &&
        a.assistantCopyStreaming === bm.assistantCopyStreaming &&
        a.revertTurnCount === bm.revertTurnCount &&
        a.groupedWithNext === bm.groupedWithNext &&
        a.groupedWithPrevious === bm.groupedWithPrevious &&
        a.continuesSteer === bm.continuesSteer &&
        sameFoldPosition(a.fold, bm.fold)
      );
    }
  }
}

export function handoffRunsSignature(runs: ReadonlyArray<HandoffTimelineRun>): string {
  return runs
    .map(
      (run) =>
        `${run.id}\0${run.providerInstanceId}\0${run.ordinal}\0${run.modelSelection.instanceId}\0${run.modelSelection.model}`,
    )
    .join("\n");
}

// Expanded-id sets can be rebuilt during render; comparing them by content keeps
// the render-time state update in useIncrementalTimelineRows from repeating forever.
export function sameRowsInput(
  left: MessagesTimelineRowsInput,
  right: MessagesTimelineRowsInput,
): boolean {
  for (const key of Object.keys(right) as Array<keyof MessagesTimelineRowsInput>) {
    const previous = left[key];
    const next = right[key];
    if (Object.is(previous, next)) continue;
    if (previous instanceof Set && next instanceof Set && shallow(previous, next)) continue;
    return false;
  }
  return Object.keys(left).length === Object.keys(right).length;
}
