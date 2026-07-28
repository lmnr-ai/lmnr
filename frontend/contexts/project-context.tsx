"use client";

import { createContext, type PropsWithChildren, use, useCallback, useEffect, useMemo } from "react";
import useSWR, { type KeyedMutator } from "swr";

import { type ProjectDetails } from "@/lib/actions/project";
import { type Project, type Workspace } from "@/lib/workspaces/types";

// Canonical settings-section union. components/shared-settings/index.tsx imports this as `Section`.
export type SettingsSection =
  | "usage"
  | "team"
  | "deployment"
  | "integrations"
  | "reports"
  | "billing"
  | "workspace-general"
  | "general"
  | "project-api-keys"
  | "provider-api-keys"
  | "model-costs"
  | "render-templates"
  | "agent-versions"
  | "security"
  | "alerts";

type ProjectContextType = {
  workspace?: Workspace;
  project?: ProjectDetails;
  projects: Project[];
  // Project-scoped settings URL. Settings live at /project/[id]/settings (there is no workspace
  // route); with no project bound (e.g. the empty-workspace surface) this degrades to /projects.
  settingsHref: (section?: SettingsSection) => string;
  // Update the live project (settings, name, ...) in the shared SWR cache. Writers pass a
  // functional updater and { revalidate: false } for an optimistic local update — this is how
  // settings changes reflect live across the app without a full router.refresh().
  mutateProject: KeyedMutator<ProjectDetails | undefined>;
};

const noopMutateProject = (async () => undefined) as KeyedMutator<ProjectDetails | undefined>;

export const ProjectContext = createContext<ProjectContextType>({
  project: undefined,
  workspace: undefined,
  projects: [],
  settingsHref: () => "/projects",
  mutateProject: noopMutateProject,
});

export const ProjectContextProvider = ({
  project: initialProject,
  projects,
  workspace,
  children,
}: PropsWithChildren<Omit<ProjectContextType, "settingsHref" | "mutateProject">>) => {
  // The project lives in SWR's module cache — a client-owned store (null fetcher) seeded once
  // from the SSR prop. This is the single source of truth for the current project: it survives
  // hook remounts across soft navigation (a frozen prop did not) and lets any writer reflect a
  // settings/name change live via `mutateProject` instead of re-running the whole server tree.
  // Key is per project, so switching projects reads that project's own cache/seed.
  const projectKey = initialProject ? `project-details:${initialProject.id}` : null;
  const { data: project, mutate: mutateProject } = useSWR<ProjectDetails | undefined>(projectKey, null, {
    fallbackData: initialProject,
  });

  // `fallbackData` doesn't write the cache, so `mutateProject((cur)=>...)` gets undefined and no-ops.
  // Seed the cache; re-seed on SSR prop change (same-project refresh keeps the key) to avoid staleness.
  const projectSignature = initialProject ? JSON.stringify(initialProject) : null;
  useEffect(() => {
    if (projectKey && initialProject) {
      mutateProject(initialProject, { revalidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey, projectSignature]);

  const settingsHref = useCallback(
    (section?: SettingsSection) =>
      project ? `/project/${project.id}/settings${section ? `?tab=${section}` : ""}` : "/projects",
    [project]
  );
  const value = useMemo(
    () => ({ project, projects, workspace, settingsHref, mutateProject }),
    [project, projects, workspace, settingsHref, mutateProject]
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export function useProjectContext() {
  return use(ProjectContext);
}
