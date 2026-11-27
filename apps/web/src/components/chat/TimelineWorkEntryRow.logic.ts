import { msg } from "gt-react";
import * as DateTime from "effect/DateTime";
import type { OrchestrationV2FileChangeDetail, OrchestrationV2TurnItem } from "@s1tools/contracts";
import { commandDisplayText } from "@s1tools/client-runtime/work-log/command-label";
import type { MarkdownExtensions } from "~/markdown/wordsHast";
import {
  resolveWorkEntryToolPresentation,
  toolGroupAction,
  type ToolGroupSummaryKind,
} from "@s1tools/client-runtime/work-log/presentation";
import { splitsSurrogatePair } from "@s1tools/shared/assistantCitations";
import { countFileChangeLines } from "@s1tools/shared/fileChangeLineCounts";
import { isJavaScriptReplTool } from "@s1tools/shared/toolActivity";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";
import { m, type MessageResolver } from "../../i18n/messages";
import { workEntryDisplayIndicatesToolFailure, type WorkLogEntry } from "../../session-logic";
import { workEntryDisplayLabel, workEntryReadPaths } from "./MessagesTimeline.logic";
import { type TimelineWorkEntry } from "./timelineRowContext";
import { type WorkEntryIconName } from "./TimelineToolActivityIcon";

function toolGroupSummaryIconName(kind: ToolGroupSummaryKind): WorkEntryIconName {
  switch (kind) {
    case "pull-request":
    case "link-pr":
    case "unlink-pr":
    case "list-prs":
    case "watch-pr":
    case "unwatch-pr":
      return "pull-request";
    case "read":
      return "eye";
    case "edit":
      return "square-pen";
    case "command":
      return "terminal";
    case "thread-create":
      return "s1-code";
    case "browser":
      return "browser";
    case "device":
      return "device";
    case "search":
      return "globe";
    case "code-search":
      return "search";
    case "other":
      return "wrench";
    case "dynamic-tool":
      return "hammer";
    case "reasoning":
      return "brain";
    case "agent-tool":
      return "bot";
    case "tone-tool":
      return "zap";
    case "update":
    case "mixed":
      return "hammer";
  }
}

export function workToneIcon(tone: TimelineWorkEntry["tone"]): {
  iconName: WorkEntryIconName;
  className: string;
} {
  if (tone === "error") {
    return {
      iconName: "circle-alert",
      className: "text-foreground/92",
    };
  }
  if (tone === "thinking") {
    return {
      iconName: "brain",
      className: "text-icon-muted",
    };
  }
  if (tone === "info") {
    return {
      iconName: "check",
      className: "text-muted-foreground",
    };
  }
  return {
    iconName: "zap",
    className: "text-foreground/92",
  };
}

export function workEntryRawCommand(
  workEntry: Pick<TimelineWorkEntry, "command" | "rawCommand">,
): string | null {
  const rawCommand = workEntry.rawCommand?.trim();
  if (!rawCommand || !workEntry.command) {
    return null;
  }
  return rawCommand === workEntry.command.trim() ? null : rawCommand;
}

export function buildToolCallExpandedBody(
  workEntry: TimelineWorkEntry,
  workspaceRoot: string | undefined,
  visibleLabel: string,
  viewedImagePath: string | null,
  resolve: MessageResolver = m,
): string | null {
  const blocks: string[] = [];
  const seen = new Set<string>([visibleLabel.trim()]);
  const addBlock = (value: string | null | undefined) => {
    const text = value?.trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    blocks.push(text);
  };
  if (workEntry.itemType === "dynamic_tool" && workEntry.toolData !== undefined) {
    const input =
      workEntry.structuredPayload?.type === "dynamic_tool"
        ? workEntry.structuredPayload.input
        : workEntry.toolData !== null &&
            typeof workEntry.toolData === "object" &&
            "input" in workEntry.toolData
          ? workEntry.toolData.input
          : undefined;
    if (input !== undefined) {
      addBlock(resolve(msg("Tool input\n{input}", { input: JSON.stringify(input, null, 2) })));
    }
  }
  const command = workEntry.command?.trim();
  const raw = workEntryRawCommand(workEntry);
  if (command === visibleLabel.trim()) {
    seen.add(command);
  } else {
    addBlock(raw ?? command);
  }
  const detail = workEntry.detail?.trim();
  if (detail !== viewedImagePath?.trim()) {
    addBlock(detail);
  }
  const viewedImagePaths = new Set(
    viewedImagePath
      ? [viewedImagePath.trim(), formatWorkspaceRelativePath(viewedImagePath, workspaceRoot)]
      : [],
  );
  const changedFiles = (workEntry.changedFiles ?? []).flatMap((filePath) => {
    const formattedPath = formatWorkspaceRelativePath(filePath, workspaceRoot);
    return viewedImagePaths.has(filePath) ||
      viewedImagePaths.has(formattedPath) ||
      filePath.trim() === detail ||
      formattedPath === detail
      ? []
      : [formattedPath];
  });
  if (changedFiles.length > 0) {
    addBlock([...new Set(changedFiles)].join("\n"));
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

export function workEntryIconName(workEntry: TimelineWorkEntry): WorkEntryIconName {
  if (workEntry.structuredPayload?.type === "notification") {
    if (workEntry.structuredPayload.outcome === "failed") return "circle-alert";
    const source = workEntry.structuredPayload.source;
    switch (source.kind) {
      case "subagent":
      case "delegated_task":
        return "bot";
      case "command":
        return "terminal";
      case "monitor":
        return "eye";
      case "background_task":
        return "zap";
      case "system":
        return "s1-code";
      default:
        source satisfies never;
        return "zap";
    }
  }
  if (workEntry.itemType === "system_notice") {
    return workEntry.structuredPayload?.type === "system_notice" &&
      workEntry.structuredPayload.level === "info"
      ? "zap"
      : "circle-alert";
  }
  if (workEntry.itemType === "user_input_request" || workEntry.itemType === "approval_request") {
    return "message-circle";
  }
  if (workEntry.itemType === "todo_list") return "list-todo";
  if (workEntry.toolSurface) return workEntry.toolSurface;
  if (
    workEntry.structuredPayload?.type === "dynamic_tool" &&
    isJavaScriptReplTool(workEntry.structuredPayload.toolName)
  )
    return "code";
  const toolPresentation = resolveWorkEntryToolPresentation(workEntry, undefined, m);
  if (toolPresentation) return toolPresentation.icon;
  const action = toolGroupAction(workEntry);
  if (action === "edit") {
    const operation = fileChangeOperation(workEntry);
    if (operation === "write") return "file-plus";
    if (operation === "delete") return "file-x";
    if (operation === "move") return "file-move";
  }
  if (action !== "other") return toolGroupSummaryIconName(action);

  switch (workEntry.itemType) {
    case "dynamic_tool":
      return "wrench";
    case "subagent":
      return "bot";
  }

  return workToneIcon(workEntry.tone).iconName;
}

// Look past the visible label so long destinations and inline delimiters can close.
// This is bounded lookahead, not document-wide Markdown parity: a closing delimiter
// or reference definition beyond this prefix remains unresolved by the parser.
export const THOUGHT_PREVIEW_SOURCE_MAX_LENGTH = 8_192;
export const THOUGHT_PREVIEW_MAX_LENGTH = 2_048;

export function sliceThoughtPreviewSource(text: string): string {
  return text.slice(
    0,
    splitsSurrogatePair(text, THOUGHT_PREVIEW_SOURCE_MAX_LENGTH)
      ? THOUGHT_PREVIEW_SOURCE_MAX_LENGTH - 1
      : THOUGHT_PREVIEW_SOURCE_MAX_LENGTH,
  );
}

/** The latest thing folded text says: its last non-empty line, before the length limit. */
export function captionSourceLine(text: string): string {
  const line = text.split(/\r?\n/).findLast((candidate) => candidate.trim() !== "") ?? "";
  return sliceThoughtPreviewSource(line.replace(/^[ \t]*(?:#{1,6}|[-*+]|\d+\.)[ \t]+/, "").trim());
}

const thoughtPreviews = new Map<string, MarkdownExtensions>();

/** Compact reasoning keeps formulas while flattening other Markdown into label text. */
export function thoughtPreviewMarkdown(fallback: string): MarkdownExtensions {
  let extensions = thoughtPreviews.get(fallback);
  if (!extensions) {
    extensions = { preview: { fallback, maxLength: THOUGHT_PREVIEW_MAX_LENGTH } };
    thoughtPreviews.set(fallback, extensions);
  }
  return extensions;
}

export type WorkStepResult =
  | { readonly kind: "diff"; readonly additions: number; readonly deletions: number }
  | { readonly kind: "count"; readonly value: number; readonly noun: "file" | "hit" | "result" }
  | { readonly kind: "failed" }
  | { readonly kind: "declined" }
  | { readonly kind: "stopped" }
  | { readonly kind: "exit"; readonly code: number }
  | { readonly kind: "duration"; readonly ms: number }
  | { readonly kind: "live"; readonly startedAt: string }
  | { readonly kind: "progress"; readonly done: number; readonly total: number };

export interface WorkStepParts {
  /** Null for tools without a fixed verb; their label carries the whole sentence. */
  readonly verb: string | null;
  readonly target: string;
  readonly targetIsCode: boolean;
  readonly result: WorkStepResult | null;
}

const fileChangeDiffStats = new WeakMap<object, { additions: number; deletions: number } | null>();

function fileChangeDiffStat(
  item: OrchestrationV2TurnItem | undefined,
): { additions: number; deletions: number } | null {
  if (item?.type !== "file_change") return null;
  if (item.additions !== undefined || item.deletions !== undefined) {
    return { additions: item.additions ?? 0, deletions: item.deletions ?? 0 };
  }
  const cached = fileChangeDiffStats.get(item);
  if (cached !== undefined) return cached;
  const stat = countFileChangeLines(item);
  fileChangeDiffStats.set(item, stat);
  return stat;
}

type FileChangeOperation = "write" | "delete" | "move" | "edit";

function changeOperation(change: OrchestrationV2FileChangeDetail): FileChangeOperation {
  if (change.oldPath !== undefined) return "move";
  switch (change.operation.toLowerCase()) {
    case "add":
    case "added":
    case "create":
    case "created":
      return "write";
    case "delete":
    case "deleted":
    case "remove":
    case "removed":
      return "delete";
    case "move":
    case "moved":
    case "rename":
    case "renamed":
      return "move";
    default:
      return "edit";
  }
}

/** What a file change did, when its provider says; mixed or unknown changes are edits. */
function fileChangeOperation(entry: WorkLogEntry): FileChangeOperation {
  const item = entry.structuredPayload;
  if (item?.type !== "file_change" || !item.changes?.length) return "edit";
  const operations = new Set(item.changes.map(changeOperation));
  return operations.size === 1 ? [...operations][0]! : "edit";
}

function itemDurationMs(item: OrchestrationV2TurnItem | undefined): number | null {
  if (!item?.startedAt || !item.completedAt) return null;
  return Math.max(
    0,
    DateTime.toEpochMillis(item.completedAt) - DateTime.toEpochMillis(item.startedAt),
  );
}

function inputString(input: unknown, keys: ReadonlyArray<string>): string | null {
  if (input === null || typeof input !== "object") return null;
  for (const key of keys) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function workStepStatusResult(entry: WorkLogEntry): WorkStepResult | null {
  if (entry.toolLifecycleStatus === "declined") return { kind: "declined" };
  if (entry.toolLifecycleStatus === "stopped") return { kind: "stopped" };
  if (entry.toolLifecycleStatus !== "inProgress" && workEntryDisplayIndicatesToolFailure(entry)) {
    return { kind: "failed" };
  }
  return null;
}

// Unparsed grep output and truncation notes arrive as line-less records, so only records with a
// line number are matches.
function searchHitCount(
  results: Extract<OrchestrationV2TurnItem, { type: "file_search" }>["results"],
): WorkStepResult | null {
  const hits = results?.filter((result) => result.line !== undefined).length ?? 0;
  return hits > 0 ? { kind: "count", value: hits, noun: "hit" } : null;
}

/** Splits a step into the verb, target, and result the trace shows in rows, the live island, and chips. */
export function workStepParts(
  entry: WorkLogEntry,
  workspaceRoot: string | undefined,
  resolve: MessageResolver = m,
  fallbackLabel?: string,
): WorkStepParts {
  const statusResult = workStepStatusResult(entry);
  const item = entry.structuredPayload;
  const other = (): WorkStepParts => ({
    verb: null,
    target: fallbackLabel ?? workEntryDisplayLabel(entry, workspaceRoot, resolve),
    targetIsCode: false,
    result: statusResult,
  });
  if (entry.itemType === "reasoning") {
    return {
      verb:
        entry.toolLifecycleStatus === "inProgress"
          ? resolve(msg("Thinking"))
          : resolve(msg("Thought", { $context: "noun, a reasoning step" })),
      target: entry.detail?.trim().split("\n", 1)[0]?.trim() ?? "",
      targetIsCode: false,
      result: null,
    };
  }
  if (item?.type === "todo_list" && item.steps.length > 0) {
    const done = item.steps.filter((step) => step.status === "completed").length;
    const running = item.steps.find((step) => step.status === "running");
    return {
      verb: resolve(msg("Plan", { $context: "noun, a step that updated the agent's task list" })),
      target:
        running?.text ??
        resolve(
          msg("{done}/{total} done", {
            done,
            total: item.steps.length,
            $context: "how many tasks of the agent's plan are finished",
          }),
        ),
      targetIsCode: false,
      result: running ? { kind: "progress", done, total: item.steps.length } : null,
    };
  }
  if (resolveWorkEntryToolPresentation(entry, undefined, resolve)) return other();
  switch (toolGroupAction(entry)) {
    case "read": {
      const paths = workEntryReadPaths(entry, workspaceRoot);
      if (paths.length === 0) return other();
      return {
        verb: resolve(msg("Read", { $context: "verb, a step that read files" })),
        target: paths.join(", "),
        targetIsCode: true,
        result:
          statusResult ??
          (paths.length > 1 ? { kind: "count", value: paths.length, noun: "file" } : null),
      };
    }
    case "edit": {
      const files = (entry.changedFiles ?? []).map((path) =>
        formatWorkspaceRelativePath(path, workspaceRoot),
      );
      const [first] = files;
      if (first === undefined) return other();
      const diff = fileChangeDiffStat(item);
      const operation = fileChangeOperation(entry);
      return {
        verb: resolve(
          operation === "write"
            ? msg("Write", { $context: "verb, a step that created a new file" })
            : operation === "delete"
              ? msg("Delete", { $context: "verb, a step that deleted files" })
              : operation === "move"
                ? msg("Move", { $context: "verb, a step that moved or renamed files" })
                : msg("Edit", { $context: "verb, a step that edited files" }),
        ),
        target:
          files.length === 1
            ? first
            : resolve(
                msg("{count, plural, one {{path} +{count} more} other {{path} +{count} more}}", {
                  path: first,
                  count: files.length - 1,
                }),
              ),
        targetIsCode: true,
        result: statusResult ?? (diff ? { kind: "diff", ...diff } : null),
      };
    }
    case "command": {
      const command = entry.command?.trim();
      if (!command) return other();
      const exitCode = item?.type === "command_execution" ? item.exitCode : undefined;
      const duration = itemDurationMs(item);
      return {
        verb: resolve(msg("Run", { $context: "verb, a step that ran a shell command" })),
        target: commandDisplayText(command),
        targetIsCode: true,
        result:
          entry.toolLifecycleStatus === "inProgress"
            ? { kind: "live", startedAt: entry.createdAt }
            : exitCode !== undefined && exitCode !== 0
              ? { kind: "exit", code: exitCode }
              : (statusResult ??
                (duration !== null && duration >= 1_000
                  ? { kind: "duration", ms: duration }
                  : null)),
      };
    }
    case "code-search": {
      const pattern =
        item?.type === "file_search"
          ? item.pattern?.trim() || null
          : item?.type === "dynamic_tool"
            ? inputString(item.input, ["pattern", "query", "glob"])
            : null;
      if (!pattern) return other();
      return {
        verb: resolve(msg("Search", { $context: "verb, a step that searched code" })),
        target: pattern,
        targetIsCode: true,
        result:
          statusResult ?? (item?.type === "file_search" ? searchHitCount(item.results) : null),
      };
    }
    case "search": {
      const query =
        item?.type === "web_search"
          ? item.patterns?.filter((pattern) => pattern.trim()).join(", ") || null
          : item?.type === "dynamic_tool"
            ? inputString(item.input, ["query", "q", "url"])
            : null;
      if (!query) return other();
      return {
        verb: resolve(msg("Web", { $context: "short column label for a web search step" })),
        target: query,
        targetIsCode: false,
        result:
          statusResult ??
          (item?.type === "web_search" && item.results
            ? { kind: "count", value: item.results.length, noun: "result" }
            : null),
      };
    }
    default:
      return other();
  }
}

export interface WorkStepChip {
  readonly id: string;
  readonly icon: TimelineWorkEntry["toolIcon"];
  readonly iconName: WorkEntryIconName;
  readonly text:
    | { readonly kind: "diff"; readonly additions: number; readonly deletions: number }
    | { readonly kind: "count"; readonly value: number }
    | { readonly kind: "exit"; readonly code: number }
    /** A command that succeeded; we cannot know what it counted. */
    | { readonly kind: "ok" }
    | null;
  readonly failed: boolean;
}

/** One finished step, as the island's film shows it. */
export function workStepChip(entry: WorkLogEntry, parts: WorkStepParts): WorkStepChip {
  const result = parts.result;
  const command = toolGroupAction(entry) === "command" && Boolean(entry.command?.trim());
  const failed = result?.kind === "failed" || result?.kind === "exit";
  return {
    id: entry.id,
    icon: entry.toolIcon ?? entry.toolSource?.icon,
    iconName: workEntryIconName(entry),
    text:
      result?.kind === "diff"
        ? result
        : result?.kind === "count"
          ? { kind: "count", value: result.value }
          : result?.kind === "exit"
            ? result
            : command && !failed && result?.kind !== "declined" && result?.kind !== "stopped"
              ? { kind: "ok" }
              : null,
    failed,
  };
}

// A URL's host and last path segment keep a fetch's island short; its row keeps the whole URL.
function shortUrl(target: string): string {
  try {
    const url = new URL(target);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    return last === undefined
      ? url.host
      : segments.length === 1
        ? `${url.host}/${last}`
        : `${url.host}/…/${last}`;
  } catch {
    return target;
  }
}

function basename(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, "")
      .split(/[\\/]/)
      .at(-1) || path
  );
}

/** The island's short target: one file's name, a count of several, or the step's own target. */
export function workStepIslandTarget(
  entry: WorkLogEntry,
  parts: WorkStepParts,
  workspaceRoot: string | undefined,
  resolve: MessageResolver = m,
): string {
  const action = toolGroupAction(entry);
  const paths =
    action === "read"
      ? workEntryReadPaths(entry, workspaceRoot)
      : action === "edit"
        ? (entry.changedFiles ?? [])
        : [];
  if (/^https?:\/\//i.test(parts.target)) return shortUrl(parts.target);
  if (parts.verb === null || paths.length === 0) return parts.target;
  return paths.length === 1
    ? basename(paths[0]!)
    : resolve(
        msg("{count, plural, one {{count} file} other {{count} files}}", { count: paths.length }),
      );
}
