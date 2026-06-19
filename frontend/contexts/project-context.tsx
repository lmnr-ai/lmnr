"use client";

import { createContext, type PropsWithChildren, use, useCallback, useMemo } from "react";

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
};

export const ProjectContext = createContext<ProjectContextType>({
  project: undefined,
  workspace: undefined,
  projects: [],
  settingsHref: () => "/projects",
});

export const ProjectContextProvider = ({
  project,
  projects,
  workspace,
  children,
}: PropsWithChildren<Omit<ProjectContextType, "settingsHref">>) => {
  const settingsHref = useCallback(
    (section?: SettingsSection) =>
      project ? `/project/${project.id}/settings${section ? `?tab=${section}` : ""}` : "/projects",
    [project]
  );
  const value = useMemo(
    () => ({ project, projects, workspace, settingsHref }),
    [project, projects, workspace, settingsHref]
  );
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export function useProjectContext() {
  return use(ProjectContext);
}
