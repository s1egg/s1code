import { msg } from "gt-react";
import { useGT } from "gt-react";
import { sourceControlClients } from "@s1tools/client-runtime/source-control-clients";
import { scopeThreadRef } from "@s1tools/client-runtime/environment";
import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@s1tools/client-runtime/state/shell";
import { formatSubagentDisplayTitle } from "@s1tools/client-runtime/state/subagent-display";
import {
  threadPullRequestKeysEqual,
  visibleThreadPullRequests,
} from "@s1tools/client-runtime/thread-pull-requests";
import type {
  EnvironmentId,
  IssueTrackerKind,
  PreviewSessionSnapshot,
  ProjectId,
  ThreadId,
} from "@s1tools/contracts";
import { faviconUrlForOrigin } from "@s1tools/shared/favicon";
import {
  Bot,
  CircleDotIcon,
  FileDiff,
  Files,
  Globe2,
  MessagesSquare,
  Smartphone,
  TerminalSquare,
} from "lucide-react";

import { m, type MessageResolver } from "~/i18n/messages";
import { linkedThreadTitle } from "~/linkedThreadSurface";
import type { DesktopPreviewOverlay } from "~/previewStateStore";
import type { RightPanelSurface } from "~/rightPanelStore";
import { cn } from "~/lib/utils";
import { issueStatePresentation } from "~/components/issue/issuePresentation";
import { issueEnvironment } from "~/state/issues";
import {
  useProjects,
  useQuietThreadShell,
  useServerConfigs,
  useThreadShells,
} from "~/state/entities";
import { useDeviceState } from "~/state/device";
import {
  newestPullRequestSummary,
  pullRequestEnvironment,
  useSharedPullRequestSummary,
} from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";
import { AndroidIcon, AppleIcon } from "~/components/Icons";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";
import { resolvePullRequestState } from "~/components/pullRequest/pullRequestPresentation";
import { FaviconImage } from "~/components/preview/PreviewFaviconIcon";
import { PierreEntryIcon } from "~/components/chat/PierreEntryIcon";

export function previewTabIdOf(
  surface: RightPanelSurface,
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
): string | null {
  if (surface.kind !== "preview" || !surface.resourceId) return null;
  return sessions[surface.resourceId]?.tabId ?? null;
}

/**
 * Stays disabled until desktop overlay state arrives: a server session id can
 * resolve while the preview manager's createTab is still in flight, and muting
 * then fails with a PreviewTabNotFoundError nothing surfaces to the user.
 */
export function tabMuteMenuItem(
  input: {
    overlay: DesktopPreviewOverlay | null;
    canResolveRuntimeTabId: boolean;
  },
  resolve: MessageResolver = m,
): { label: string; disabled: boolean } {
  const muted = input.overlay?.audioMuted ?? false;
  return {
    label: muted ? resolve(msg("Unmute tab")) : resolve(msg("Mute tab")),
    disabled: input.overlay === null || !input.canResolveRuntimeTabId,
  };
}

export function surfaceTitle(
  surface: RightPanelSurface,
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
  resolve: MessageResolver = m,
): string {
  switch (surface.kind) {
    case "diff":
      return resolve(msg("Diff"));
    case "files":
      return resolve(msg("Files"));
    case "file":
      return surface.relativePath.slice(
        Math.max(surface.relativePath.lastIndexOf("/"), surface.relativePath.lastIndexOf("\\")) + 1,
      );
    case "terminal":
      return resolve(msg("Terminal"));
    case "pull-request":
      return `#${surface.number}`;
    case "pull-requests":
      return resolve(msg("Linked items"));
    case "issue":
      // A git host numbers its issues; a tracker with keys of its own, such as Linear, names them.
      return /^\d+$/.test(surface.key) ? `#${surface.key}` : surface.key;
    case "device":
      return surface.title ?? surface.target?.name ?? resolve(msg("Device"));
    case "thread":
      // Until the thread's own title loads.
      return resolve(msg("Thread"));
    case "linked-thread":
      return linkedThreadTitle(
        surface,
        resolve(msg("Thread on {label}", { label: surface.label })),
      );
    case "preview": {
      const snapshot = surface.resourceId ? sessions[surface.resourceId] : null;
      if (!snapshot || snapshot.navStatus._tag === "Idle") return resolve(msg("Browser"));
      if (snapshot.navStatus.title.trim().length > 0) return snapshot.navStatus.title;
      try {
        return new URL(snapshot.navStatus.url).host || resolve(msg("Browser"));
      } catch {
        return resolve(msg("Browser"));
      }
    }
  }
}

function PreviewFavicon({ capturedUrl, url }: { capturedUrl: string | null; url: string | null }) {
  const publicProviderUrl = faviconUrlForOrigin(url, 32);
  return (
    <FaviconImage
      sources={[capturedUrl, publicProviderUrl]}
      fallback={<Globe2 className="size-3 shrink-0" />}
      className="size-3 shrink-0 rounded-sm object-contain"
    />
  );
}

function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

export function previewFaviconOf(
  surface: RightPanelSurface,
  sessions: Readonly<Record<string, PreviewSessionSnapshot>>,
  desktopByTabId: Readonly<Record<string, DesktopPreviewOverlay>>,
): { url: string | null; capturedUrl: string | null } {
  const snapshot =
    surface.kind === "preview" && surface.resourceId ? sessions[surface.resourceId] : null;
  const url = !snapshot || snapshot.navStatus._tag === "Idle" ? null : snapshot.navStatus.url;
  const favicon = snapshot ? (desktopByTabId[snapshot.tabId]?.favicon ?? null) : null;
  const capturedUrl = favicon && url && sameOrigin(favicon.pageUrl, url) ? favicon.dataUrl : null;
  return { url, capturedUrl };
}

export function SurfaceIcon({
  surface,
  previewUrl,
  previewCapturedUrl,
  theme,
  environmentId,
}: {
  surface: RightPanelSurface;
  previewUrl: string | null;
  previewCapturedUrl: string | null;
  theme: "light" | "dark";
  environmentId: EnvironmentId | null;
}) {
  switch (surface.kind) {
    case "preview":
      return <PreviewFavicon capturedUrl={previewCapturedUrl} url={previewUrl} />;
    case "diff":
      return <FileDiff className="size-3 shrink-0" />;
    case "files":
      return <Files className="size-3 shrink-0" />;
    case "file":
      return (
        <PierreEntryIcon
          pathValue={surface.relativePath}
          kind="file"
          theme={theme}
          className="size-3"
        />
      );
    case "terminal":
      return <TerminalSquare className="size-3 shrink-0" />;
    case "pull-request":
      return <PullRequestSurfaceIcon surface={surface} environmentId={environmentId} />;
    case "pull-requests":
      return <PullRequestGlyph.link className="size-3 shrink-0" />;
    case "issue":
      return <IssueSurfaceIcon surface={surface} environmentId={environmentId} />;
    case "thread":
      return <SideChatTabIcon environmentId={environmentId} threadId={surface.threadId} />;
    case "linked-thread":
      return <MessagesSquare className="size-3 shrink-0" />;
    case "device":
      return surface.target?.platform === "ios" ? (
        <AppleIcon className="size-3 shrink-0" />
      ) : surface.target?.platform === "android" ? (
        <AndroidIcon className="size-3 shrink-0" />
      ) : (
        <Smartphone className="size-3 shrink-0" />
      );
  }
}

export const SIDE_CHAT_STATE_LABELS = {
  "needs approval": msg("needs approval"),
  "needs input": msg("needs input"),
  running: msg("running", { $context: "side chat status" }),
} as const;

/** What a side chat tab's dot shows and its title's accessible name says. */
export function sideChatTabState(shell: EnvironmentThreadShell | null) {
  if (shell === null) return null;
  if (shell.hasPendingApprovals || shell.pendingSubagentRequest === "approval") {
    return "needs approval";
  }
  if (shell.hasPendingUserInput || shell.pendingSubagentRequest === "user_input") {
    return "needs input";
  }
  return threadRuntimeIsActive(shell.runtime) ? "running" : null;
}

// Static dots: a side chat or subagent tab can stay open for a whole run.
function SideChatTabIcon(props: { environmentId: EnvironmentId | null; threadId: ThreadId }) {
  const shell = useQuietThreadShell(
    props.environmentId === null ? null : scopeThreadRef(props.environmentId, props.threadId),
  );
  const state = sideChatTabState(shell);
  const Icon = shell !== null && shell.lineage.sideChat !== true ? Bot : MessagesSquare;
  return (
    <>
      <Icon className="size-3 shrink-0" />
      {state === null ? null : (
        <span
          className={cn(
            "absolute -top-0.5 -right-0.5 size-1.5 rounded-full",
            state === "running" ? "bg-muted-foreground" : "bg-info",
          )}
          aria-hidden
        />
      )}
    </>
  );
}

export function resolvePullRequestTabLink(
  threads: readonly Pick<EnvironmentThreadShell, "environmentId" | "pullRequests">[],
  environmentId: EnvironmentId | null,
  host: string | null,
  reference: { repository: string; number: number },
) {
  if (environmentId === null || host === null) return undefined;
  // Keys are cached per object, so one target normalizes once instead of once per link.
  const target = { host, repository: reference.repository, number: reference.number };
  let newest: EnvironmentThreadShell["pullRequests"][number] | undefined;
  for (const thread of threads) {
    if (thread.environmentId !== environmentId) continue;
    for (const link of visibleThreadPullRequests(thread.pullRequests)) {
      if (!threadPullRequestKeysEqual(link, target)) continue;
      if (
        newest === undefined ||
        (link.snapshot?.syncedAt ?? "") > (newest.snapshot?.syncedAt ?? "")
      )
        newest = link;
    }
  }
  return newest;
}

/** The issue's own state mark, from the detail its panel already reads; a plain dot until then. */
function IssueSurfaceIcon({
  surface,
  environmentId,
}: {
  surface: Extract<RightPanelSurface, { kind: "issue" }>;
  environmentId: EnvironmentId | null;
}) {
  const resolvedEnvironmentId =
    (surface.environmentId as EnvironmentId | undefined) ?? environmentId;
  const detail = useEnvironmentQuery(
    resolvedEnvironmentId === null
      ? null
      : issueEnvironment.detail({
          environmentId: resolvedEnvironmentId,
          input: {
            projectId: surface.projectId as ProjectId,
            tracker: surface.tracker as IssueTrackerKind,
            ...(surface.host ? { host: surface.host } : {}),
            scope: surface.scope,
            key: surface.key,
          },
        }),
  ).data;
  if (detail === null) return <CircleDotIcon className="size-3 shrink-0" />;
  const presentation = issueStatePresentation(detail.state);
  return (
    <presentation.Icon
      role="img"
      aria-label={presentation.label}
      className={cn("size-3 shrink-0", presentation.toneClassName)}
    />
  );
}

function PullRequestSurfaceIcon({
  surface,
  environmentId,
}: {
  surface: Extract<RightPanelSurface, { kind: "pull-request" }>;
  environmentId: EnvironmentId | null;
}) {
  const resolvedEnvironmentId =
    (surface.environmentId as EnvironmentId | undefined) ?? environmentId;
  const projects = useProjects();
  const threads = useThreadShells();
  const project = projects.find(
    (entry) => entry.environmentId === resolvedEnvironmentId && entry.id === surface.projectId,
  );
  const identity = project?.repositoryIdentity;
  const host =
    surface.host ??
    (identity?.provider
      ? sourceControlClients.changeRequestHost(identity, identity.provider)
      : null);
  const configs = useServerConfigs();
  const capabilities =
    resolvedEnvironmentId === null
      ? undefined
      : configs.get(resolvedEnvironmentId)?.environment.capabilities;
  const linkedSnapshot =
    capabilities !== undefined
      ? (resolvePullRequestTabLink(threads, resolvedEnvironmentId, host, surface)?.snapshot ?? null)
      : null;
  const detail = useEnvironmentQuery(
    resolvedEnvironmentId === null || capabilities === undefined || linkedSnapshot !== null
      ? null
      : pullRequestEnvironment.detail({
          environmentId: resolvedEnvironmentId,
          input: {
            projectId: surface.projectId as ProjectId,
            ...(capabilities !== undefined && surface.host !== undefined
              ? { host: surface.host }
              : {}),
            repository: surface.repository,
            number: surface.number,
            allowStale: false,
          },
        }),
  ).data;
  const reference = {
    projectId: surface.projectId as ProjectId,
    repository: surface.repository,
    number: surface.number,
  };
  const sharedSummary = useSharedPullRequestSummary(resolvedEnvironmentId, reference);
  const status = linkedSnapshot ?? newestPullRequestSummary(detail, sharedSummary) ?? null;
  if (status === null) {
    return <PullRequestGlyph.pullRequest className="size-3 shrink-0 text-muted-foreground" />;
  }
  const presentation = resolvePullRequestState({
    state: status.state,
    isDraft: status.isDraft ?? detail?.isDraft ?? false,
  });
  return <presentation.Icon className={cn("size-3 shrink-0", presentation.toneClassName)} />;
}

export function DeviceTabTooltip(props: {
  surface: Extract<RightPanelSurface, { kind: "device" }>;
  environmentId: EnvironmentId | null;
  title: string;
}) {
  const gt = useGT();
  const target = props.surface.target;
  const { state } = useDeviceState(target ? props.environmentId : null);
  const device = target
    ? state.devices.find((entry) => entry.hostId === target.hostId && entry.id === target.deviceId)
    : undefined;
  const host = target ? state.hosts.find((entry) => entry.id === target.hostId) : undefined;
  return (
    <div className="flex flex-col gap-0.5">
      <span>{props.title}</span>
      {target ? (
        <span className="text-muted-foreground">
          {host?.label ?? gt("Device host")} ·{" "}
          {device?.version ?? (target.platform === "ios" ? "iOS" : "Android")}
        </span>
      ) : null}
    </div>
  );
}

/** A side chat or subagent names itself once its shell loads; other items keep `title`. */
export function usePaneSurfaceTitle(
  surface: RightPanelSurface,
  title: string,
  environmentId: EnvironmentId | null,
): { title: string; sideChatState: ReturnType<typeof sideChatTabState> } {
  const shell = useQuietThreadShell(
    surface.kind === "thread" && environmentId !== null
      ? scopeThreadRef(environmentId, surface.threadId)
      : null,
  );
  return {
    title:
      shell === null
        ? title
        : shell.lineage.sideChat === true
          ? shell.title
          : formatSubagentDisplayTitle(shell.title),
    sideChatState: sideChatTabState(shell),
  };
}
