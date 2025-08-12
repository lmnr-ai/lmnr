"use client";

import React, { createContext, PropsWithChildren, use } from "react";

import { Project, Workspace } from "@/lib/workspaces/types";

type ProjectContextType = {
  workspace?: Workspace;
  project?: Project;
  projects: Project[];
};

export const ProjectContext = createContext<ProjectContextType>({
  project: undefined,
  workspace: undefined,
  projects: [],
});

export const ProjectContextProvider = ({
  project,
  projects,
  workspace,
  children,
}: PropsWithChildren<ProjectContextType>) => (
  <ProjectContext.Provider value={{ project, projects, workspace }}>{children}</ProjectContext.Provider>
);

export function useProjectContext() {
  return use(ProjectContext);
}
