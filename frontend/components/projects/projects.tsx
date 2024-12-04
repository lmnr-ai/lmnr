'use client';

import React from 'react';
import useSWR from 'swr';

import ProjectCard from '@/components/projects/project-card';
import { cn, swrFetcher } from '@/lib/utils';
import { WorkspaceWithProjects } from '@/lib/workspaces/types';

import { Skeleton } from '../ui/skeleton';
import ProjectCreateDialog from './project-create-dialog';
import WorkspaceCreateDialog from './workspace-create-dialog';

interface ProjectsProps {
  isWorkspaceEnabled: boolean;
}

export default function Projects({ isWorkspaceEnabled }: ProjectsProps) {
  const { data, mutate, isLoading } = useSWR<WorkspaceWithProjects[]>(
    '/api/workspaces',
    swrFetcher
  );

  return (
    <>
      <div className="h-full p-4 w-full flex-grow">
        <div className="flex flex-col items-start">
          <div className="flex items-center space-x-4 mb-4">
            {data === undefined ? (
              <Skeleton className="w-36 h-6 items-center" />
            ) : (
              <>
                <ProjectCreateDialog
                  onProjectCreate={mutate}
                  workspaces={data}
                />
                {isWorkspaceEnabled && (
                  <WorkspaceCreateDialog onWorkspaceCreate={mutate} />
                )}
              </>
            )}
          </div>
          {isLoading && (
            <div className="flex flex-col space-y-12">
              {[...Array(5).keys()].map((_, index) => (
                <div key={index} className="flex flex-col">
                  <Skeleton className="h-8 w-1/3 mb-4" />
                  <div className="grid gap-4 grid-cols-1 max-[768px]:grid-cols-1 md:grid-cols-1 lg:grid-cols-2 min-[1441px]:grid-cols-3">
                    <Skeleton className="h-32 w-96" />
                    <Skeleton className="h-32 w-96" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {data !== undefined && (
            <div className="flex flex-col space-y-12">
              {data.map((workspace) => (
                <div key={workspace.id} className="flex flex-col">
                  <div className="text-lg font-medium mb-4 flex items-center gap-2">
                    <span className="">{workspace.name}</span>
                    <div className={cn("text-xs text-secondary-foreground p-0.5 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20", workspace.tierName === 'Pro' && 'border-primary bg-primary/10 text-primary')}>
                      {workspace.tierName}
                    </div>
                  </div>
                  {workspace.projects.length === 0 && (
                    <div className="flex flex-col text-secondary-foreground text-sm">
                      No projects in this workspace yet. <br />
                      Start by creating a new project.
                    </div>
                  )}
                  {workspace.projects.length > 0 && (
                    <div className="grid gap-4 grid-cols-1 max-[768px]:grid-cols-1 md:grid-cols-1 lg:grid-cols-2 min-[1441px]:grid-cols-3">
                      {workspace.projects.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
