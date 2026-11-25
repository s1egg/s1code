import {
  threadRuntimeCanArchive,
  type ThreadRuntimeSummary,
} from "@s1tools/client-runtime/state/models";

export function threadCanArchive(runtime: ThreadRuntimeSummary | null | undefined): boolean {
  return threadRuntimeCanArchive(runtime);
}
