import { useGT } from "gt-react";
import type {
  EditorId,
  EnvironmentId,
  IssueTrackerKind,
  PreviewAnnotationPayload,
  ProjectId,
  ResolvedKeybindingsConfig,
  ScopedThreadRef,
  ThreadLinkedPullRequest,
  ThreadPullRequestLink,
} from "@s1tools/contracts";
import { scopedThreadKey } from "@s1tools/client-runtime/environment";
import { useAtomValue } from "@effect/atom-react";
import { lazy, Suspense, type ReactNode } from "react";
import { LinkedThreadPane } from "./LinkedThreadPane";
import SideThreadPane from "./SideThreadPane";
import type { ComposerImageAttachment, DraftId } from "../../composerDraftStore";
import type { ShortcutMatchContext } from "../../keybindings";
import type { SideChatParentPanel } from "../../lib/sideChatPane";
import { type RightPanelSurface, useRightPanelStore } from "../../rightPanelStore";
import {
  PersistentThreadTerminalPane,
  type PersistentThreadTerminalPaneProps,
} from "../PersistentThreadTerminals";
import { IssueDetailPanel } from "../issue/IssueDetailPanel";
import { pullRequestPanelContext } from "../pullRequest/pullRequestDetail.logic";
import { PullRequestDetailPanel } from "../pullRequest/PullRequestDetailPanel";
import { PullRequestDetailGhost } from "../pullRequest/PullRequestGhosts";
import { PullRequestsUnavailableState } from "../pullRequest/PullRequestsUnavailableState";
import { ThreadPullRequestsPanel } from "../pullRequest/ThreadPullRequestsPanel";
import { serverEnvironment } from "../../state/server";

const PreviewPanel = lazy(() =>
  import("../preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);
const DiffPanel = lazy(() => import("../DiffPanel"));
const DevicePanel = lazy(() =>
  import("../device/DevicePanel").then((module) => ({ default: module.DevicePanel })),
);
const FilePreviewPanel = lazy(() => import("../files/FilePreviewPanel"));

type RightPanelTerminalProps = Omit<PersistentThreadTerminalPaneProps, "visible" | "threadRef">;

interface RightPanelPullRequestProps {
  readonly capabilityKnown: boolean;
  readonly supported: boolean;
  readonly projectId: ProjectId | null;
  readonly pullRequests: ReadonlyArray<ThreadPullRequestLink>;
  readonly linkedPullRequest: ThreadLinkedPullRequest | null;
  readonly branchPullRequest: ThreadLinkedPullRequest | null | undefined;
  readonly onBack: (() => void) | undefined;
}

interface RightPanelFileProps {
  readonly projectId?: ProjectId | undefined;
  readonly projectName: string | null;
  readonly workspaceRoot: string | undefined;
  readonly availableEditors: ReadonlyArray<EditorId>;
  readonly pendingSurfaceIds: ReadonlySet<string>;
  readonly onOpenFile: (relativePath: string) => void;
  readonly onPendingChange: (relativePath: string, pending: boolean) => void;
}

export function RightPanelSurfaceContent(props: {
  readonly surface: RightPanelSurface;
  /** The pane is the one the user last worked in, so it takes its keyboard shortcuts. */
  readonly focused: boolean;
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly visible: boolean;
  readonly composerDraftTarget: ScopedThreadRef | DraftId;
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly configuredPreviewUrls: ReadonlyArray<string>;
  readonly workspaceMutationId: string | null;
  /** What the diff is read under, as the Changes totals are; see `useWorkspaceRevision`. */
  readonly workspaceRevision: string | null;
  readonly getShortcutContext: () => ShortcutMatchContext;
  readonly onSendAnnotation: (
    annotation: PreviewAnnotationPayload,
    image: ComposerImageAttachment | null,
  ) => void;
  readonly onCloseSurface: (surface: RightPanelSurface) => void;
  readonly terminal: RightPanelTerminalProps;
  readonly pullRequest: RightPanelPullRequestProps;
  readonly files: RightPanelFileProps;
  readonly sideChatParentPanel: SideChatParentPanel;
}) {
  const { surface, threadRef, visible, onCloseSurface } = props;
  const gt = useGT();
  switch (surface.kind) {
    case "preview":
      return (
        <Suspense fallback={null}>
          <PreviewPanel
            threadRef={threadRef}
            tabId={surface.resourceId}
            configuredUrls={props.configuredPreviewUrls}
            visible={visible}
            onSendAnnotation={props.onSendAnnotation}
          />
        </Suspense>
      );
    case "terminal":
      return (
        <PersistentThreadTerminalPane {...props.terminal} visible={visible} threadRef={threadRef} />
      );
    case "diff":
      return (
        <Suspense fallback={null}>
          <DiffPanel
            key={scopedThreadKey(threadRef)}
            mode="embedded"
            composerDraftTarget={props.composerDraftTarget}
            workspaceMutationId={props.workspaceRevision}
            visible={visible}
          />
        </Suspense>
      );
    case "pull-request": {
      const pullRequest = props.pullRequest;
      if (!pullRequest.capabilityKnown) return <PullRequestDetailGhost />;
      if (!pullRequest.supported) {
        return (
          <PullRequestsUnavailableState
            title={gt("Pull requests unavailable")}
            error={gt("Update this environment's S1 Code server to browse pull requests.")}
          />
        );
      }
      return (
        <PullRequestDetailPanel
          getShortcutContext={props.getShortcutContext}
          shortcutsEnabled={visible && props.focused}
          key={`${scopedThreadKey(threadRef)}:${surface.id}`}
          environmentId={
            (surface.environmentId as EnvironmentId | undefined) ?? props.environmentId
          }
          onSelectPullRequest={(reference) => {
            useRightPanelStore.getState().openPullRequest(threadRef, {
              ...(surface.environmentId === undefined
                ? {}
                : { environmentId: surface.environmentId }),
              projectId: reference.projectId,
              repository: reference.repository,
              number: reference.number,
              ...(reference.host ? { host: reference.host } : {}),
            });
          }}
          threadRef={threadRef}
          reference={{
            projectId: surface.projectId as ProjectId,
            ...(surface.host ? { host: surface.host } : {}),
            repository: surface.repository,
            number: surface.number,
          }}
          storedTab={surface.detailTab ?? "summary"}
          revealUrl={surface.revealUrl}
          onRevealSettled={(revealUrl) => {
            useRightPanelStore.getState().settlePullRequestReveal(threadRef, surface.id, revealUrl);
          }}
          onTabChange={(tab) => {
            useRightPanelStore.getState().setPullRequestDetailTab(threadRef, surface.id, tab);
          }}
          context={pullRequestPanelContext(
            {
              projectId: pullRequest.projectId,
              pullRequests: pullRequest.pullRequests,
              linkedPullRequest: pullRequest.linkedPullRequest,
              branchPullRequest: pullRequest.branchPullRequest,
            },
            surface,
          )}
          composerDraftTarget={props.composerDraftTarget}
          onBack={pullRequest.onBack}
        />
      );
    }
    case "issue": {
      // A remote issue beside a local thread is read from its own environment.
      const issueEnvironmentId =
        (surface.environmentId as EnvironmentId | undefined) ?? props.environmentId;
      return (
        <IssueSurfaceSupport environmentId={issueEnvironmentId}>
          <IssueDetailPanel
            key={`${issueEnvironmentId}:${surface.id}`}
            environmentId={issueEnvironmentId}
            reference={{
              projectId: surface.projectId as ProjectId,
              tracker: surface.tracker as IssueTrackerKind,
              ...(surface.host ? { host: surface.host } : {}),
              scope: surface.scope,
              key: surface.key,
            }}
            threadRef={threadRef}
            onSelectPullRequest={(reference) => {
              useRightPanelStore.getState().openPullRequest(threadRef, {
                ...(surface.environmentId === undefined
                  ? {}
                  : { environmentId: surface.environmentId }),
                projectId: reference.projectId,
                repository: reference.repository,
                number: reference.number,
                ...(reference.host ? { host: reference.host } : {}),
              });
            }}
            onSelectIssue={({ host, ...reference }) => {
              useRightPanelStore.getState().openIssue(threadRef, {
                ...(surface.environmentId === undefined
                  ? {}
                  : { environmentId: surface.environmentId }),
                ...reference,
                ...(host ? { host } : {}),
              });
            }}
          />
        </IssueSurfaceSupport>
      );
    }
    case "pull-requests":
      return <ThreadPullRequestsPanel threadRef={threadRef} />;
    case "thread":
      // Not lazy: revealing a suspended tiptap editor tears down its view and crashes the composer.
      return (
        <SideThreadPane
          key={surface.id}
          parentRef={threadRef}
          surface={surface}
          parentPanel={props.sideChatParentPanel}
          onClose={() => onCloseSurface(surface)}
        />
      );
    case "linked-thread":
      return (
        <LinkedThreadPane
          key={surface.id}
          panelRef={threadRef}
          surface={surface}
          visible={visible}
        />
      );
    case "device":
      return (
        <Suspense fallback={null}>
          <DevicePanel
            threadRef={threadRef}
            key={surface.id}
            surface={surface}
            visible={visible}
            onDismissSetup={() => {
              props.onCloseSurface(surface);
              useRightPanelStore.getState().show(threadRef);
            }}
          />
        </Suspense>
      );
    case "files":
    case "file": {
      const files = props.files;
      const attachment = surface.kind === "file" ? surface.attachment : undefined;
      if (!attachment && (files.projectName === null || !files.workspaceRoot)) return null;
      return (
        <Suspense fallback={null}>
          <FilePreviewPanel
            key={`${props.environmentId}:${
              attachment ? `attachment:${attachment.id}` : files.workspaceRoot
            }`}
            environmentId={props.environmentId}
            cwd={files.workspaceRoot ?? ""}
            projectName={files.projectName ?? ""}
            projectId={files.projectId}
            threadRef={threadRef}
            composerDraftTarget={props.composerDraftTarget}
            keybindings={props.keybindings}
            availableEditors={files.availableEditors}
            openInShortcutEnabled={visible}
            relativePath={surface.kind === "file" ? surface.relativePath : null}
            {...(attachment ? { attachment } : {})}
            revealLine={surface.kind === "file" ? (surface.revealLine ?? null) : null}
            revealRequestId={surface.kind === "file" ? surface.revealRequestId : 0}
            onOpenFile={files.onOpenFile}
            onNavigateFolder={(relativePath, folderTrail, keepSource) =>
              useRightPanelStore
                .getState()
                .navigateFolder(threadRef, surface.id, relativePath, folderTrail, keepSource)
            }
            folderTrail={surface.folderTrail}
            onPendingChange={files.onPendingChange}
            selectedFilePending={surface.kind === "file" && files.pendingSurfaceIds.has(surface.id)}
            workspaceMutationId={props.workspaceMutationId}
          />
        </Suspense>
      );
    }
  }
}

/** An issue's panel, once its environment's server says it can show issues. */
function IssueSurfaceSupport({
  environmentId,
  children,
}: {
  environmentId: EnvironmentId;
  children: ReactNode;
}) {
  const gt = useGT();
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  if (!config) return <PullRequestDetailGhost />;
  if (config.environment.capabilities.issues !== true) {
    return (
      <PullRequestsUnavailableState
        title={gt("Issues unavailable")}
        error={gt("Update this environment's S1 Code server to browse issues.")}
      />
    );
  }
  return children;
}
