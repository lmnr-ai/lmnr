'use client';

import React from 'react';
import useSWR from 'swr';

import ProjectCard from '@/components/projects/project-card';
import { cn, swrFetcher } from '@/lib/utils';
import { ProjectStats, WorkspaceWithProjects } from '@/lib/workspaces/types';

interface ProjectsListProps {
  workspaces: WorkspaceWithProjects[];
}

const WorkspacesList = ({ workspaces }: ProjectsListProps) => {
  const params = new URLSearchParams(
    workspaces
      .flatMap((workspace) => workspace.projects)
      .map((project) => ['projectId', project.id])
  );

  const { data, isLoading } = useSWR<Record<string, ProjectStats>>(
    `/api/workspaces/stats?${params}`,
    swrFetcher
  );

  return (
    <div className="flex flex-col space-y-12">
      {workspaces.map((workspace) => (
        <div key={workspace.id} className="flex flex-col">
          <div className="text-lg font-medium mb-4 flex items-center gap-2">
            <span className="">{workspace.name}</span>
            <div
              className={cn(
                'text-xs text-secondary-foreground p-0.5 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20',
                workspace.tierName === 'Pro' &&
                  'border-primary bg-primary/10 text-primary'
              )}
            >
              {workspace.tierName}
            </div>
          </div>
          {workspace.projects.length > 0 ? (
            <div className="grid gap-4 grid-cols-1 max-[768px]:grid-cols-1 md:grid-cols-1 lg:grid-cols-2 min-[1441px]:grid-cols-3">
              {workspace.projects.map((project) => (
                <ProjectCard
                  stats={data?.[project.id]}
                  isLoading={isLoading}
                  key={project.id}
                  project={project}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col text-secondary-foreground text-sm">
              No projects in this workspace yet. <br />
              Start by creating a new project.
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default WorkspacesList;
