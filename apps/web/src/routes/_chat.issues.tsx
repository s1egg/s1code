import { createFileRoute } from "@tanstack/react-router";

import { redirectToThreadDetails } from "../components/chat/threadDetailsRedirects";
import {
  issueListPreferences,
  writeIssueListPreferences,
} from "../components/issue/issueListPreferences";
import { issuesSearchFromUrl } from "../components/issue/issuesSearch.logic";
import { useRightPanelStore } from "../rightPanelStore";

export const Route = createFileRoute("/_chat/issues")({
  beforeLoad: ({ location }) => {
    const search = issuesSearchFromUrl(location.search as Record<string, unknown>);
    writeIssueListPreferences(issueListPreferences(search));
    const { tracker, scope, key, selectedProjectId, selectedEnvironmentId, selectedHost } = search;
    redirectToThreadDetails(
      "issues",
      tracker && scope && key && selectedProjectId
        ? (threadRef) =>
            useRightPanelStore.getState().openIssue(threadRef, {
              ...(selectedEnvironmentId && selectedEnvironmentId !== threadRef.environmentId
                ? { environmentId: selectedEnvironmentId }
                : {}),
              projectId: selectedProjectId,
              tracker,
              ...(selectedHost ? { host: selectedHost } : {}),
              scope,
              key,
            })
        : undefined,
    );
  },
});
