import type { PullRequestChangeBreakdown } from "@s1tools/contracts";
import { summarizeChangedFiles } from "@s1tools/shared/changedFileKind";
import type { ProviderFileStats } from "@s1tools/source-control-core/server/PullRequestProvider";

export function toChangeBreakdown(stats: ProviderFileStats): PullRequestChangeBreakdown {
  if (stats.truncated) return null;
  return summarizeChangedFiles(stats.files);
}
