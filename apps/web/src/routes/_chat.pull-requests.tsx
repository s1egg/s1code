import { createFileRoute } from "@tanstack/react-router";

import { redirectToThreadDetails } from "../components/chat/threadDetailsRedirects";
import {
  pullRequestListPreferences,
  writePullRequestListPreferences,
} from "../components/pullRequest/pullRequestListPreferences";
import { pullRequestsSearchFromUrl } from "../components/pullRequest/pullRequestsSearch.logic";
import { useRightPanelStore } from "../rightPanelStore";

export const Route = createFileRoute("/_chat/pull-requests")({
  beforeLoad: ({ location }) => {
    const search = pullRequestsSearchFromUrl(location.search as Record<string, unknown>);
    writePullRequestListPreferences(pullRequestListPreferences(search));
    const { repository, number, selectedProjectId, selectedEnvironmentId, selectedHost } = search;
    redirectToThreadDetails(
      "pull-requests",
      repository && number && selectedProjectId
        ? (threadRef) =>
            useRightPanelStore.getState().openPullRequest(threadRef, {
              ...(selectedEnvironmentId && selectedEnvironmentId !== threadRef.environmentId
                ? { environmentId: selectedEnvironmentId }
                : {}),
              projectId: selectedProjectId,
              ...(selectedHost ? { host: selectedHost } : {}),
              repository,
              number,
              ...(search.selectedUrl
                ? { url: search.selectedUrl, revealUrl: search.selectedUrl }
                : {}),
            })
        : undefined,
    );
  },
});
