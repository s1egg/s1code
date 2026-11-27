import type { EnvironmentThreadShell } from "@s1tools/client-runtime/state/shell";
import type {
  EnvironmentId,
  ScopedProjectRef,
  SidebarProjectGroupingMode,
} from "@s1tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@s1tools/client-runtime/state/connections";
import { Atom } from "effect/reactivity";
import { environmentCatalog } from "../../connection/catalog";
import { olderSettledThreads } from "../../state/threads";
import { useMessages } from "gt-react-native";
import { useMemo } from "react";

import { useProjects } from "../../state/entities";
import type { PendingNewTask } from "../../state/use-pending-new-tasks";
import { useThreadListNow } from "../threads/use-thread-list-now";
import { homeProjectChoicesFor, resolveHomeProjectChoice } from "./homeProjectChoices";

export const olderSettledProjectRefsAtom = Atom.make((get) => {
  const refs: ScopedProjectRef[] = [];
  for (const environmentId of enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))) {
    const shelf = get(olderSettledThreads.olderSettledAtom(environmentId));
    for (const [projectId, count] of shelf?.counts ?? []) {
      if (count > 0) refs.push({ environmentId, projectId });
    }
  }
  return refs;
}).pipe(Atom.withLabel("mobile:older-settled-projects"));

/** The projects Home, the sidebar and the scope sheet offer, and the one they all show. */
export function useHomeProjectSelection(input: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly pendingTasks: ReadonlyArray<PendingNewTask>;
  readonly environmentId: EnvironmentId | null;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  readonly selectedProjectKey: string | null;
}) {
  const m = useMessages();
  const projects = useProjects();
  const olderSettledProjects = useAtomValue(olderSettledProjectRefsAtom);
  const now = useThreadListNow(input.threads);
  const { threads, pendingTasks, environmentId, projectGroupingMode } = input;
  const choices = useMemo(
    () =>
      homeProjectChoicesFor(
        {
          projects,
          threads,
          pendingTasks,
          olderSettledProjects,
          environmentId,
          projectGroupingMode,
          now,
        },
        m,
      ),
    [
      projects,
      threads,
      pendingTasks,
      olderSettledProjects,
      environmentId,
      projectGroupingMode,
      now,
      m,
    ],
  );
  const selected = resolveHomeProjectChoice({
    choices,
    selectedProjectKey: input.selectedProjectKey,
    projects,
    projectGroupingMode,
  });
  return { choices, selected } as const;
}
