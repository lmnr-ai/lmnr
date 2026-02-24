"use client";

import { isEmpty, times } from "lodash";
import { AlertCircleIcon, FolderOpen } from "lucide-react";
import React, { useEffect } from "react";
import useSWR from "swr";

import ProjectCard from "@/components/projects/project-card.tsx";
import ProjectCreateDialog from "@/components/projects/project-create-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";
import { type Project, type Workspace, WorkspaceTier } from "@/lib/workspaces/types";

interface ProjectsProps {
  workspace: Workspace;
}

export default function Projects({ workspace }: ProjectsProps) {
  const { data, mutate, isLoading, error } = useSWR<Project[]>(`/api/workspaces/${workspace.id}/projects`, swrFetcher);

  const { toast } = useToast();

  useEffect(() => {
    if (error && error instanceof Error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  }, [error, toast]);

  if (error && error instanceof Error) {
    return (
      <Alert variant="destructive">
        <AlertCircleIcon className="size-5" />
        <AlertTitle>{error.name}</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-medium">Projects</h1>
      {!data ? (
        <Skeleton className="w-36 h-6" />
      ) : (
        <ProjectCreateDialog
          workspaceId={workspace.id}
          onProjectCreate={mutate}
          isFreeTier={workspace.tierName === WorkspaceTier.FREE}
          projectCount={data.length}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading && times(4, (i) => <Skeleton key={i} className="h-44 w-full" />)}
        {!isLoading && !isEmpty(data) && data?.map((project) => <ProjectCard key={project.id} project={project} />)}
      </div>
      {!isLoading && isEmpty(data) && (
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <FolderOpen className="size-12 text-secondary-foreground/60" />
            <div className="flex flex-col gap-2">
              <h3 className="text-xl font-semibold">No projects yet</h3>
              <p className="text-sm text-muted-foreground">Create your first project to get started.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
