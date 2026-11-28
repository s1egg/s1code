import type { DraftId } from "~/composerDraftStore";
import { useComposerDraftStore } from "~/composerDraftStore";
import type { ScopedProjectRef } from "@s1tools/contracts";
import { isScratchProject } from "@s1tools/client-runtime/state/projects";
import { T, useGT } from "gt-react";

import { useScratchProject } from "~/hooks/useScratchProject";
import { isTriagePrompt } from "@s1tools/shared/triagePrompt";
import { useProjects } from "~/state/entities";
import { useEnvironments } from "~/state/environments";
import { TriageDraftHero } from "./TriageDraftHero";

interface DraftHeroHeadlineProps {
  readonly draftId: DraftId | null;
  readonly activeProjectRef: ScopedProjectRef | null;
  readonly activeProjectTitle: string | null;
}

/** The new thread's greeting; the project itself is picked in the composer's control row. */
export function DraftHeroHeadline({
  draftId,
  activeProjectRef,
  activeProjectTitle,
}: DraftHeroHeadlineProps) {
  const gt = useGT();
  const projects = useProjects();
  const { environments } = useEnvironments();
  const { scratchWorkspaceRootFor } = useScratchProject();
  // A boolean, so typing in a draft does not re-render the hero.
  const isTriageDraftPrompt = useComposerDraftStore((store) =>
    draftId ? isTriagePrompt(store.getComposerDraft(draftId)?.prompt ?? "") : false,
  );
  const activeProject =
    activeProjectRef === null
      ? null
      : (projects.find(
          (project) =>
            project.environmentId === activeProjectRef.environmentId &&
            project.id === activeProjectRef.projectId,
        ) ?? null);
  const isScratchDraft =
    activeProject !== null &&
    isScratchProject(activeProject, scratchWorkspaceRootFor(activeProject.environmentId));

  if (isScratchDraft && isTriageDraftPrompt) {
    const environment = environments.find(
      (entry) => entry.environmentId === activeProject.environmentId,
    );
    return (
      <TriageDraftHero
        machineLabel={environment?.label ?? null}
        serverVersion={environment?.serverConfig?.environment.serverVersion ?? null}
      />
    );
  }

  return (
    <h1 className="mx-auto line-clamp-2 w-full max-w-5xl text-center font-normal text-2xl text-foreground tracking-tight [overflow-wrap:anywhere] sm:text-3xl [@media(max-height:28rem)]:sr-only">
      {isScratchDraft ? (
        <T>What should we work on?</T>
      ) : activeProjectTitle !== null ? (
        gt("What should we build in {project}?", { project: activeProjectTitle })
      ) : (
        gt("What should we build?")
      )}
    </h1>
  );
}
