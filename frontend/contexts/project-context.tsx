"use client";

import React, { createContext, type PropsWithChildren, use } from "react";

import { type Project, type Workspace } from "@/lib/workspaces/types";

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
