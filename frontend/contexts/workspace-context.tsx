"use client";

import { useParams } from "next/navigation";
import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import useSWR, { SWRResponse } from "swr";

import { swrFetcher } from "@/lib/utils";
import { Project, WorkspaceWithProjects } from "@/lib/workspaces/types";

type WorkspaceContextType = {
  workspace?: WorkspaceWithProjects;
  project?: Project;
  workspacesResponse: SWRResponse<WorkspaceWithProjects[]>;
};

export const WorkspaceContext = createContext<WorkspaceContextType>({
  workspace: undefined,
  project: undefined,
  workspacesResponse: {
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
  const workspacesResponse = useSWR<WorkspaceWithProjects[]>("/api/workspaces", swrFetcher);

  const value = useMemo<WorkspaceContextType>(() => {
    const allProjects = workspacesResponse.data?.flatMap((workspace) => workspace.projects) ?? [];
    const project = allProjects.find((project) => project.id === params?.projectId);

    const workspace = workspacesResponse.data?.find((workspace) => workspace.id === project?.workspaceId);

    return {
      workspace,
      project,
      workspacesResponse,
    };
  }, [params?.projectId, workspacesResponse]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};
