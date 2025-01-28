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
    <Link href={`/project/${project.id}/traces`} key={project.id}>
      <div className="hover:bg-secondary w-96 h-44 rounded-md bg-secondary/40 transition-all duration-100">
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium">{project.name}</p>
            <ChevronRightIcon className="w-4 text-secondary-foreground" />
          </div>
          <p className="text-muted-foreground font-mono text-xs">{project.id}</p>
          <div className="flex gap-8">
            {isLoading ? (
              <>
                <div className="flex flex-col gap-2">
                  <Skeleton className="w-12 h-5" />
                  <Skeleton className="w-8 h-6" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="w-12 h-5" />
                  <Skeleton className="w-8 h-6" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="w-12 h-5" />
                  <Skeleton className="w-8 h-6" />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <p className="text-sm">Spans</p>
                  <p className="font-mono text-xl">{data?.spansCount}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm">Evaluations</p>
                  <p className="font-mono text-xl">{data?.evaluationsCount}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm">Datasets</p>
                  <p className="font-mono text-xl">{data?.datasetsCount}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
