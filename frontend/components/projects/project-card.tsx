import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/utils";
import { Project, ProjectStats } from "@/lib/workspaces/types";

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const { data, isLoading } = useSWR<ProjectStats>(`/api/projects/${project.id}/stats`, swrFetcher);

  return (
    <Link href={`/projects/${project.id}/traces`} key={project.id}>
      <div className="hover:bg-secondary w-96 h-44 rounded-md bg-secondary/40 transition-all duration-100">
        <div className="p-4 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium">{project.name}</p>
            <ChevronRightIcon className="w-4 text-secondary-foreground" />
          </div>
          <div className="flex gap-8">
            {isLoading ? (
              <>
                <div className="flex flex-col w-full gap-2">
                  <Skeleton className="w-full h-6" />
                  <Skeleton className="w-full h-6" />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col">
                  <p className="text-xs text-muted-foreground">Spans</p>
                  <p className="font-mono">{data?.spansCount}</p>
                </div>
                <div className="flex flex-col">
                  <p className="text-xs text-muted-foreground">Evaluations</p>
                  <p className="font-mono">{data?.evaluationsCount}</p>
                </div>
                <div className="flex flex-col">
                  <p className="text-xs text-muted-foreground">Datasets</p>
                  <p className="font-mono">{data?.datasetsCount}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
