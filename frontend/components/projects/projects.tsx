"use client";

import { isEmpty, times } from "lodash";
import React from "react";
import useSWR from "swr";

import ProjectCard from "@/components/projects/project-card.tsx";
import ProjectCreateDialog from "@/components/projects/project-create-dialog";
import WorkspaceCreateDialog from "@/components/projects/workspace-create-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/utils";
import { Project } from "@/lib/workspaces/types";

interface ProjectsProps {
  workspaceId: string;
  isWorkspaceEnabled: boolean;
}

export default function Projects({ workspaceId, isWorkspaceEnabled }: ProjectsProps) {
  const { data, mutate, isLoading } = useSWR<Project[]>(`/api/workspaces/${workspaceId}/projects`, swrFetcher);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Projects</h1>
      {!data ? (
        <Skeleton className="w-36 h-6" />
      ) : (
        <>
          <ProjectCreateDialog workspaceId={workspaceId} onProjectCreate={mutate} />
          {isWorkspaceEnabled && <WorkspaceCreateDialog onWorkspaceCreate={mutate} />}
        </>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading && times(4, (i) => <Skeleton key={i} className="h-44 w-full" />)}
        {!isLoading && !isEmpty(data) && data?.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
      {!isLoading && isEmpty(data) && (
        <div className="text-secondary-foreground">
          No projects in this workspace yet. <br />
          Start by creating a new project.
        </div>
      )}
    </div>
  );
}
