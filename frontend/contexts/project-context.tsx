'use client'

import React, { createContext, use } from 'react';

type ProjectContextType = {
  projectId: string;
  projectName: string;
};

export const ProjectContext = createContext<ProjectContextType>({
  projectId: "",
  projectName: "",
});

type ProjectContextProviderProps = {
  projectId: string;
  projectName: string;
  children: React.ReactNode;
};

export const ProjectContextProvider = ({ projectId, projectName, children }: ProjectContextProviderProps) => {
  return (
    <ProjectContext.Provider value={{ projectId, projectName }}>
      {children}
    </ProjectContext.Provider>
  );
};

export function useProjectContext() {
  return use(ProjectContext);
}