import { sourceControlClients } from "@s1tools/client-runtime/source-control-clients";
import type { EnvironmentId, ProjectId, RepositoryIdentity } from "@s1tools/contracts";
import { splitsSurrogatePair } from "@s1tools/shared/assistantCitations";

import {
  findProjectForRepository,
  findScopedProject,
  resolveProjectScope,
  resolveSelectedEnvironmentId,
} from "./pullRequestList.logic";
import type { PullRequestListPreferences, PullRequestListSort } from "./pullRequestListPreferences";
import { SORT_OPTIONS } from "./pullRequestListOptions";

/** An old Pull requests page address: the list's filters, and the pull request it had open. */
export interface PullRequestsSearch extends PullRequestListPreferences {
  readonly selectedUrl?: string;
  readonly repository?: string;
  readonly number?: number;
  readonly selectedProjectId?: ProjectId | undefined;
  readonly selectedHost?: string | undefined;
  readonly selectedEnvironmentId?: EnvironmentId | undefined;
}

const MAX_SEARCH_LABEL_CANDIDATES = 100;

function sliceSearchText(value: string) {
  return value.slice(0, splitsSurrogatePair(value, 200) ? 199 : 200);
}

function pullRequestSearchLabels(raw: unknown): PullRequestsSearch["labels"] {
  const values = (Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : []).slice(
    0,
    MAX_SEARCH_LABEL_CANDIDATES,
  );
  const labels: Array<string> = [];
  const seen = new Set<string>();
  for (const rawValue of values) {
    if (typeof rawValue !== "string") continue;
    const value = sliceSearchText(rawValue.trim());
    const key = value.toLowerCase();
    if (value.length === 0 || seen.has(key)) continue;
    labels.push(value);
    seen.add(key);
    if (labels.length === 10) break;
  }
  return labels.length === 0 ? undefined : labels;
}

export const pullRequestsSearchFromUrl = (raw: Record<string, unknown>): PullRequestsSearch => ({
  ...(typeof raw.selectedUrl === "string" ? { selectedUrl: raw.selectedUrl.slice(0, 4096) } : {}),
  involvement:
    raw.involvement === "reviewing" || raw.involvement === "authored" ? raw.involvement : "all",
  state:
    raw.state === "closed" || raw.state === "merged" || raw.state === "all" ? raw.state : "open",
  ...(SORT_OPTIONS.some((option) => option.value === raw.sort)
    ? { sort: raw.sort as PullRequestListSort }
    : {}),
  ...(typeof raw.repository === "string" && raw.repository
    ? { repository: raw.repository.slice(0, 200) }
    : {}),
  ...(typeof raw.number === "number" && Number.isInteger(raw.number) && raw.number > 0
    ? { number: raw.number }
    : {}),
  ...(typeof raw.projectId === "string" && raw.projectId
    ? { projectId: raw.projectId as ProjectId }
    : {}),
  ...(typeof raw.environmentId === "string" && raw.environmentId
    ? { environmentId: raw.environmentId as EnvironmentId }
    : {}),
  ...(typeof raw.host === "string" && raw.host ? { host: raw.host.slice(0, 200) } : {}),
  ...(typeof raw.selectedProjectId === "string" && raw.selectedProjectId
    ? { selectedProjectId: raw.selectedProjectId as ProjectId }
    : {}),
  ...(typeof raw.selectedHost === "string" && raw.selectedHost
    ? { selectedHost: raw.selectedHost.slice(0, 200) }
    : {}),
  ...(typeof raw.selectedEnvironmentId === "string" && raw.selectedEnvironmentId
    ? { selectedEnvironmentId: raw.selectedEnvironmentId as EnvironmentId }
    : {}),
  q: typeof raw.q === "string" && raw.q ? sliceSearchText(raw.q) : undefined,
  ...(raw.draft === "only" || raw.draft === "hide" ? { draft: raw.draft } : {}),
  ...(raw.review === "approved" ||
  raw.review === "changes-requested" ||
  raw.review === "review-required" ||
  raw.review === "none"
    ? { review: raw.review }
    : {}),
  ...(raw.checks === "passing" || raw.checks === "failing" ? { checks: raw.checks } : {}),
  author:
    typeof raw.author === "string" ? sliceSearchText(raw.author.trim()) || undefined : undefined,
  labels: pullRequestSearchLabels(raw.labels),
});

/**
 * The pull request an old address had open, in the project that holds it. Without a named
 * project, the repository picks it, preferring the list's server and project filters.
 */
export function resolveLinkedPullRequest<
  Project extends {
    readonly id: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly repositoryIdentity?: RepositoryIdentity | null | undefined;
  },
>(
  search: PullRequestsSearch,
  projects: ReadonlyArray<Project>,
  knownEnvironmentIds: ReadonlySet<EnvironmentId>,
) {
  const { repository, number } = search;
  if (!repository || !number) return null;
  const host = search.selectedHost ?? search.host;
  const scopedEnvironmentId =
    search.environmentId !== undefined && knownEnvironmentIds.has(search.environmentId)
      ? search.environmentId
      : null;
  // A named server still connecting stays named: falling back would match another server's
  // project where two servers share a project id.
  const selectedEnvironmentId = resolveSelectedEnvironmentId(
    search.selectedEnvironmentId,
    knownEnvironmentIds,
    scopedEnvironmentId,
  );
  const scopedProjectId = resolveProjectScope(search.projectId, projects, true);
  const linkedProjectId = resolveProjectScope(search.selectedProjectId, projects, true);
  const project =
    linkedProjectId === undefined
      ? findProjectForRepository(projects, {
          repository,
          host,
          selectedEnvironmentId,
          scopedProjectId,
          scopedEnvironmentId,
        })
      : findScopedProject(projects, selectedEnvironmentId, linkedProjectId);
  if (project === undefined) return null;
  // The address is user-controlled; its URL only stands in for the link when it names this PR.
  const link = search.selectedUrl
    ? sourceControlClients.parseChangeRequestUrl(search.selectedUrl)?.link
    : undefined;
  const url =
    link !== undefined &&
    link.number === number &&
    link.repository.toLowerCase() === repository.toLowerCase()
      ? search.selectedUrl
      : undefined;
  return {
    environmentId: project.environmentId,
    projectId: project.id,
    repository,
    number,
    ...(host ? { host } : {}),
    ...(url ? { url, revealUrl: url } : {}),
  };
}
