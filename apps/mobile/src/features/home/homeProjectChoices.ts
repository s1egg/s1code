import {
  pickableProjectGroups,
  resolveScratchProjectScopeKey,
  SCRATCH_PROJECT_SCOPE_KEY,
} from "@s1tools/client-runtime/state/project-grouping";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@s1tools/client-runtime/state/shell";
import { effectiveSnoozed } from "@s1tools/client-runtime/state/thread-settled";
import {
  isListedThreadLineage,
  type EnvironmentId,
  type ScopedProjectRef,
  type SidebarProjectGroupingMode,
} from "@s1tools/contracts";
import { msg } from "gt-react-native";

import { m, type MessageResolver } from "../../i18n/messages";

import { scopedProjectKey } from "../../lib/scopedEntities";
import {
  resolveThreadListV2Status,
  resolveThreadListV2WokeAt,
  threadHasUnseenCompletion,
  threadListV2NeedsUser,
} from "../threads/threadListV2";
import {
  buildHomeProjectScopes,
  sortHomeProjectScopes,
  type HomeProjectScope,
} from "./homeThreadList";

/** The choice for threads without a project: scratch projects, and projects no group holds. */
export const HOME_UNASSIGNED_PROJECT_KEY = "home-project:unassigned";

/** A project the Home strip, scope sheet and sidebar offer, with what its threads are doing. */
export interface HomeProjectChoice {
  readonly key: string;
  readonly title: string;
  /** Null for the choice that holds threads without a project. */
  readonly scope: HomeProjectScope | null;
  /** Every project the choice lists threads for. */
  readonly projectRefs: ReadonlyArray<ScopedProjectRef>;
  readonly environmentIds: ReadonlyArray<EnvironmentId>;
  readonly running: number;
  readonly waiting: number;
  readonly review: number;
}

type ProjectRefLike = Pick<ScopedProjectRef, "environmentId" | "projectId">;

/**
 * Open projects keep their order. An archived project follows them while it still holds a listed
 * thread or an unsent task, and threads without a project share one last choice while it holds
 * any, so neither kind of history drops out of reach. Only threads still in play badge a choice.
 */
export function buildHomeProjectChoices(input: {
  readonly scopes: ReadonlyArray<HomeProjectScope>;
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly pendingTasks: ReadonlyArray<ProjectRefLike>;
  readonly olderSettledProjects?: ReadonlyArray<ProjectRefLike>;
  readonly environmentId: EnvironmentId | null;
  readonly now: string;
  readonly unassignedTitle: string;
}): ReadonlyArray<HomeProjectChoice> {
  const scopeKeyByProject = new Map<string, string>();
  const unassignedRefs = new Map<string, ScopedProjectRef>();
  const projectScopes: HomeProjectScope[] = [];
  for (const scope of input.scopes) {
    const scratch = scope.key === SCRATCH_PROJECT_SCOPE_KEY;
    for (const ref of scope.projectRefs) {
      const key = scopedProjectKey(ref.environmentId, ref.projectId);
      if (scratch) unassignedRefs.set(key, ref);
      else scopeKeyByProject.set(key, scope.key);
    }
    if (!scratch) projectScopes.push(scope);
  }
  const choiceKeyOf = (ref: ProjectRefLike) => {
    const key = scopedProjectKey(ref.environmentId, ref.projectId);
    const scopeKey = scopeKeyByProject.get(key);
    if (scopeKey !== undefined) return scopeKey;
    if (!unassignedRefs.has(key)) {
      unassignedRefs.set(key, { environmentId: ref.environmentId, projectId: ref.projectId });
    }
    return HOME_UNASSIGNED_PROJECT_KEY;
  };
  const inEnvironment = (ref: ProjectRefLike) =>
    input.environmentId === null || ref.environmentId === input.environmentId;

  const held = new Set<string>();
  const counts = new Map<string, { running: number; waiting: number; review: number }>();
  for (const task of input.pendingTasks) {
    if (inEnvironment(task)) held.add(choiceKeyOf(task));
  }
  for (const project of input.olderSettledProjects ?? []) {
    if (inEnvironment(project)) held.add(choiceKeyOf(project));
  }
  for (const thread of input.threads) {
    if (!inEnvironment(thread) || thread.archivedAt !== null) continue;
    if (!isListedThreadLineage(thread.lineage)) continue;
    const key = choiceKeyOf(thread);
    held.add(key);
    if (thread.settledOverride === "settled") continue;
    if (effectiveSnoozed(thread, { now: input.now })) continue;
    const entry = counts.get(key) ?? { running: 0, waiting: 0, review: 0 };
    if (threadListV2NeedsUser(thread)) entry.waiting += 1;
    else if (resolveThreadListV2Status(thread) === "working") entry.running += 1;
    else if (
      threadHasUnseenCompletion(thread) ||
      resolveThreadListV2WokeAt(thread, { now: input.now }) !== null
    ) {
      entry.review += 1;
    }
    counts.set(key, entry);
  }

  const choice = (
    key: string,
    title: string,
    scope: HomeProjectScope | null,
    projectRefs: ReadonlyArray<ScopedProjectRef>,
  ): HomeProjectChoice => ({
    key,
    title,
    scope,
    projectRefs,
    environmentIds: [...new Set(projectRefs.map((ref) => ref.environmentId))],
    ...(counts.get(key) ?? { running: 0, waiting: 0, review: 0 }),
  });
  const scopeChoice = (scope: HomeProjectScope) =>
    choice(scope.key, scope.title, scope, scope.projectRefs);
  return [
    ...pickableProjectGroups(projectScopes).map(scopeChoice),
    ...projectScopes.filter((scope) => scope.archived && held.has(scope.key)).map(scopeChoice),
    ...(held.has(HOME_UNASSIGNED_PROJECT_KEY)
      ? [
          choice(HOME_UNASSIGNED_PROJECT_KEY, input.unassignedTitle, null, [
            ...unassignedRefs.values(),
          ]),
        ]
      : []),
  ];
}

/** The projects in scope, most recently active first, as the strip, sheet and sidebar list them. */
export function homeProjectChoicesFor(
  input: {
    readonly projects: ReadonlyArray<EnvironmentProject>;
    readonly threads: ReadonlyArray<EnvironmentThreadShell>;
    readonly pendingTasks: ReadonlyArray<ProjectRefLike>;
    readonly olderSettledProjects?: ReadonlyArray<ProjectRefLike>;
    readonly environmentId: EnvironmentId | null;
    readonly projectGroupingMode: SidebarProjectGroupingMode;
    readonly now: string;
  },
  resolve: MessageResolver = m,
): ReadonlyArray<HomeProjectChoice> {
  const scopes = sortHomeProjectScopes({
    scopes: buildHomeProjectScopes(input, resolve),
    threads: input.threads,
    pendingTasks: [],
    projectSortOrder: "updated_at",
  });
  return buildHomeProjectChoices({
    scopes,
    threads: input.threads,
    pendingTasks: input.pendingTasks,
    olderSettledProjects: input.olderSettledProjects ?? [],
    environmentId: input.environmentId,
    now: input.now,
    unassignedTitle: resolve(msg("No project")),
  });
}

/**
 * Exactly one choice is selected whenever there is one: the stored one while it is offered, else
 * the first. The fallback is never written back, so a project that comes back (its environment
 * reconnects or loads, or it is unarchived) is selected again.
 */
export function resolveHomeProjectChoice(input: {
  readonly choices: ReadonlyArray<HomeProjectChoice>;
  readonly selectedProjectKey: string | null;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
}): HomeProjectChoice | null {
  // A legacy per-environment scratch key, or the scratch group's key, reads as "No project".
  const storedKey =
    input.selectedProjectKey === HOME_UNASSIGNED_PROJECT_KEY
      ? HOME_UNASSIGNED_PROJECT_KEY
      : resolveScratchProjectScopeKey(input.selectedProjectKey, input.projects, {
          sidebarProjectGroupingMode: input.projectGroupingMode,
          sidebarProjectGroupingOverrides: {},
        });
  const key = storedKey === SCRATCH_PROJECT_SCOPE_KEY ? HOME_UNASSIGNED_PROJECT_KEY : storedKey;
  return (
    input.choices.find((choice) => choice.key === key) ??
    // A single project's key selects the group that holds it.
    input.choices.find((choice) =>
      choice.projectRefs.some((ref) => scopedProjectKey(ref.environmentId, ref.projectId) === key),
    ) ??
    input.choices[0] ??
    null
  );
}
