'use client';

import React from 'react'
import ProjectCard from '@/components/projects/project-card'
import { Label } from '../ui/label';
import { WorkspaceWithProjects } from '@/lib/workspaces/types';
import ProjectCreateDialog from './project-create-dialog';
import WorkspaceCreateDialog from './workspace-create-dialog';
import useSWR from 'swr';
import { swrFetcher } from '@/lib/utils';
import { Skeleton } from '../ui/skeleton';
import { Card } from '../ui/card';

interface ProjectsProps {
}

export default function Projects({ }: ProjectsProps) {
  const { data, mutate, isLoading } = useSWR<WorkspaceWithProjects[]>('/api/workspaces', swrFetcher);
  const allProjects = data?.flatMap(workspace => workspace.projects) ?? [];

  return (
    <>
      <div className="h-full p-8 w-full flex-grow">
        <div className='flex flex-col items-start'>
          <div className="flex items-center space-x-4 mb-4">
            {
              (data === undefined) ? (
                <Skeleton className="w-36 h-6 items-center" />
              ) : (
                <>
                  <ProjectCreateDialog onProjectCreate={mutate} workspaces={data} />
                  <WorkspaceCreateDialog onWorkspaceCreate={mutate} />
                </>
              )
            }
          </div>
          {isLoading && (
            <div className="flex flex-col space-y-12">
              {
                [...Array(5).keys()].map((_, index) => (
                  <div key={index} className='flex flex-col'>
                    <Skeleton className="h-8 w-1/2 mb-4" />
                    <div className='grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3'>
                      <Skeleton className="h-32 w-64" />
                      <Skeleton className="h-32 w-64" />
                      <Skeleton className="h-32 w-64" />
                    </div>
                  </div>
                ))
              }
            </div>
          )}
          {(data !== undefined) && (
            <div className="flex flex-col space-y-12">
              {data.map(workspace => (
                <div key={workspace.id} className='flex flex-col'>
                  <Label className="text-lg font-medium mb-4">{workspace.name}</Label>
                  {(workspace.projects.length === 0) && <Label>No projects</Label>}
                  {(workspace.projects.length > 0) &&
                    <div className='grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3'>
                      {workspace.projects.map(project => (
                        <ProjectCard key={project.id} project={project} />
                      ))}
                    </div>
                  }
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
