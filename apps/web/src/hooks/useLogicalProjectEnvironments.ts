import { useMessages } from "gt-react";
import { availableScratchWorkspaceRoot } from "@s1tools/client-runtime/operations/projects";
import { isScratchProject } from "@s1tools/client-runtime/state/projects";
import type { EnvironmentProject } from "@s1tools/client-runtime/state/shell";
import {
  type EnvironmentId,
  type ProjectId,
  resolveEnvironmentMachineKind,
} from "@s1tools/contracts";

import {
  type EnvironmentOption,
  resolveEnvironmentOptionLabel,
} from "../components/BranchToolbar.logic";
import type { MessageResolver } from "../i18n/messages";
import {
  deriveLogicalProjectKeyFromSettings,
  selectProjectGroupingSettings,
} from "@s1tools/client-runtime/state/project-grouping";
import { useProjects } from "../state/entities";
import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { useClientSettings } from "./useSettings";

type EnvironmentServerConfig = Parameters<typeof resolveEnvironmentMachineKind>[0];

export function buildEnvironmentOption(
  input: {
    readonly environmentId: EnvironmentId;
    readonly projectId: ProjectId | null;
    readonly primaryEnvironmentId: EnvironmentId | null;
    readonly environment: {
      readonly label: string;
      readonly serverConfig: EnvironmentServerConfig;
    } | null;
  },
  resolve: MessageResolver,
): EnvironmentOption {
  const isPrimary = input.environmentId === input.primaryEnvironmentId;
  return {
    environmentId: input.environmentId,
    projectId: input.projectId,
    label: resolveEnvironmentOptionLabel(
      {
        isPrimary,
        environmentId: input.environmentId,
        runtimeLabel: input.environment?.label ?? null,
      },
      resolve,
    ),
    isPrimary,
    machine: resolveEnvironmentMachineKind(input.environment?.serverConfig ?? null),
  };
}

export function useLogicalProjectEnvironments(
  activeProject: EnvironmentProject | null,
  scratchDraft: boolean,
): readonly EnvironmentOption[] {
  const { environments } = useEnvironments();
  const allProjects = useProjects();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const messages = useMessages();

  if (!activeProject) return [];
  const environmentById = new Map(
    environments.map((environment) => [environment.environmentId, environment]),
  );
  const envs: EnvironmentOption[] = [];
  const pushEnvironment = (environmentId: EnvironmentId, projectId: ProjectId | null) => {
    envs.push(
      buildEnvironmentOption(
        {
          environmentId,
          projectId,
          primaryEnvironmentId,
          environment: environmentById.get(environmentId) ?? null,
        },
        messages,
      ),
    );
  };
  if (scratchDraft) {
    for (const environment of environments) {
      const scratchRoot = availableScratchWorkspaceRoot(
        environment.connection.phase,
        environment.serverConfig,
      );
      if (scratchRoot === null && environment.environmentId !== activeProject.environmentId)
        continue;
      const scratchProject =
        environment.environmentId === activeProject.environmentId
          ? activeProject
          : allProjects.find(
              (p) =>
                p.environmentId === environment.environmentId && isScratchProject(p, scratchRoot),
            );
      pushEnvironment(environment.environmentId, scratchProject?.id ?? null);
    }
  } else {
    const logicalKey = deriveLogicalProjectKeyFromSettings(activeProject, projectGroupingSettings);
    const seen = new Set<string>();
    for (const p of allProjects) {
      if (seen.has(p.environmentId)) continue;
      if (deriveLogicalProjectKeyFromSettings(p, projectGroupingSettings) !== logicalKey) continue;
      seen.add(p.environmentId);
      pushEnvironment(p.environmentId, p.id);
    }
  }
  envs.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return envs;
}
