import { createFileRoute } from "@tanstack/react-router";

import { redirectToThreadDetails } from "../components/chat/threadDetailsRedirects";
import {
  pullRequestListPreferences,
  writePullRequestListPreferences,
} from "../components/pullRequest/pullRequestListPreferences";
import {
  pullRequestsSearchFromUrl,
  resolveLinkedPullRequest,
} from "../components/pullRequest/pullRequestsSearch.logic";
import { useRightPanelStore } from "../rightPanelStore";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readProjects, whenProjectsLoaded } from "../state/entities";
import { environmentPresentations } from "../state/presentation";

export const Route = createFileRoute("/_chat/pull-requests")({
  beforeLoad: ({ location }) => {
    const search = pullRequestsSearchFromUrl(location.search as Record<string, unknown>);
    writePullRequestListPreferences(pullRequestListPreferences(search));
    redirectToThreadDetails(
      "pull-requests",
      search.repository && search.number
        ? (threadRef) =>
            // A linked server's projects can arrive after the thread's sidebar mounts.
            whenProjectsLoaded(search.selectedEnvironmentId ?? search.environmentId ?? null, () => {
              const linked = resolveLinkedPullRequest(
                search,
                readProjects().filter((project) => !project.isScratch),
                new Set(appAtomRegistry.get(environmentPresentations.presentationsAtom).keys()),
              );
              if (linked === null) return;
              const { environmentId, ...pullRequest } = linked;
              useRightPanelStore.getState().openPullRequest(threadRef, {
                ...(environmentId !== threadRef.environmentId ? { environmentId } : {}),
                ...pullRequest,
              });
            })
        : undefined,
      { explicitListScope: search.projectId !== undefined || search.environmentId !== undefined },
    );
  },
});
