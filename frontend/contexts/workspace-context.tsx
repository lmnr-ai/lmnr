"use client";

import { useParams } from "next/navigation";
import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import useSWR, { SWRResponse } from "swr";

import { swrFetcher } from "@/lib/utils";
import { Project, WorkspaceWithProjects } from "@/lib/workspaces/types";

type WorkspaceContextType = {
  workspace?: WorkspaceWithProjects;
  project?: Project;
  result: SWRResponse<WorkspaceWithProjects[]>;
};

export const WorkspaceContext = createContext<WorkspaceContextType>({
  workspace: undefined,
  project: undefined,
  result: {
    data: undefined,
    isLoading: false,
    isValidating: false,
    error: undefined,
    mutate: () => Promise.resolve(undefined),
  },
});

export const useWorkspaceContext = () => useContext(WorkspaceContext);

export const WorkspaceContextProvider = ({ children }: PropsWithChildren) => {
  const params = useParams();
  const result = useSWR<WorkspaceWithProjects[]>("/api/workspaces", swrFetcher);

  const value = useMemo<WorkspaceContextType>(() => {
    const allProjects = result.data?.flatMap((workspace) => workspace.projects) ?? [];
    const project = allProjects.find((project) => project.id === params?.projectId);

    const workspace = result.data?.find((workspace) => workspace.id === project?.workspaceId);

    return {
      workspace,
      project,
      result,
    };
  }, [params?.projectId, result]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
