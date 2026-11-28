import type { EnvironmentProject } from "@s1tools/client-runtime/state/shell";
import { useGT } from "gt-react";

import { useIssuesSupported, usePullRequestsSupported } from "../../state/environments";
import { ThreadDetailsNavRow } from "./ThreadDetailsDrillIn";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { threadDetailsListCountKey, useThreadDetailsStore } from "./threadDetailsStore";

/** The ways into the pull request and issue lists, with what each last showed for the project. */
export function ThreadDetailsListRows({
  project,
  showPullRequests,
  showIssues,
  onOpen,
}: {
  project: EnvironmentProject | null;
  showPullRequests: boolean;
  showIssues: boolean;
  onOpen: (drillIn: "pull-requests" | "issues") => void;
}) {
  const gt = useGT();
  const pullRequestsSupported = usePullRequestsSupported();
  const issuesSupported = useIssuesSupported();
  const pullRequestCount = useThreadDetailsStore((state) =>
    project ? state.listCounts[threadDetailsListCountKey("pull-requests", project)] : undefined,
  );
  const issueCount = useThreadDetailsStore((state) =>
    project ? state.listCounts[threadDetailsListCountKey("issues", project)] : undefined,
  );
  return (
    <ThreadDetailsSection
      headingId="thread-details-lists-heading"
      title={gt("Pull requests and issues")}
      showHeading={false}
    >
      <div className="flex flex-col">
        {showPullRequests && pullRequestsSupported ? (
          <ThreadDetailsNavRow
            label={gt("Pull requests")}
            drillIn="pull-requests"
            detail={pullRequestCount}
            onClick={() => onOpen("pull-requests")}
          />
        ) : null}
        {showIssues && issuesSupported ? (
          <ThreadDetailsNavRow
            label={gt("Issues", { $context: "thread details row: list of issues" })}
            drillIn="issues"
            detail={issueCount}
            onClick={() => onOpen("issues")}
          />
        ) : null}
      </div>
    </ThreadDetailsSection>
  );
}
