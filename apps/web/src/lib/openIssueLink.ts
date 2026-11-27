import type {
  EnvironmentId,
  IssueTrackerConnectionList,
  ScopedThreadRef,
} from "@s1tools/contracts";
import { resolveIssueLinkTarget } from "@s1tools/client-runtime/issue-links";
import { useRouter } from "@tanstack/react-router";
import type { MouseEvent } from "react";

import { openInShownThread } from "../components/chat/openThreadDetails";
import { useRightPanelStore } from "../rightPanelStore";
import { useProjects, useServerConfigs } from "../state/entities";

/**
 * Opens an issue link beside the thread, and says whether it did. Anything else — a host no
 * project here is on, a link that merely looks like one — is left alone for the caller to handle
 * as the ordinary link it is. Mirrors `useOpenChangeRequestLink`: a reader following a link the
 * agent wrote is reading the thread, and should still be reading it afterwards.
 */
export function useOpenIssueLink(
  threadRef?: ScopedThreadRef,
  panelRef?: ScopedThreadRef,
): (
  event: Pick<
    MouseEvent<HTMLElement>,
    "preventDefault" | "stopPropagation" | "metaKey" | "ctrlKey"
  >,
  targetUrl: string,
  targetEnvironmentId?: EnvironmentId,
  trackers?: IssueTrackerConnectionList,
) => boolean {
  const allProjects = useProjects();
  const serverConfigs = useServerConfigs();
  const router = useRouter();
  return (event, targetUrl, targetEnvironmentId, trackers) => {
    if (event.metaKey || event.ctrlKey) return false;
    const resolvedPanelRef = panelRef ?? threadRef;
    // Content from another environment, such as a remote issue beside a local thread, names its own.
    const environmentId = targetEnvironmentId ?? threadRef?.environmentId;
    if (environmentId === undefined) return false;
    if (serverConfigs.get(environmentId)?.environment.capabilities.issues !== true) return false;
    const target = resolveIssueLinkTarget({
      url: targetUrl,
      projects: allProjects.filter((project) => project.environmentId === environmentId),
      trackers,
    });
    if (target === null) return false;
    event.preventDefault();
    event.stopPropagation();
    const surface = {
      projectId: target.ref.projectId,
      tracker: target.ref.tracker,
      ...(target.ref.host === undefined ? {} : { host: target.ref.host }),
      scope: target.ref.scope,
      key: target.ref.key,
      url: targetUrl,
    };
    const open = (panel: ScopedThreadRef) =>
      useRightPanelStore.getState().openIssue(panel, {
        ...(panel.environmentId === environmentId ? {} : { environmentId }),
        ...surface,
      });
    // Content outside a thread, such as a workflow's pull request, opens beside the last thread.
    if (resolvedPanelRef === undefined) void openInShownThread(router, open);
    else open(resolvedPanelRef);
    return true;
  };
}
