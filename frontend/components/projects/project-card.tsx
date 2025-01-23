import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

import { Skeleton } from '@/components/ui/skeleton';
import { Project, ProjectStats } from '@/lib/workspaces/types';

interface ProjectCardProps {
  project: Project;
  stats?: ProjectStats;
  isLoading: boolean;
}

export default function ProjectCard({
  project,
  stats = { datasetsCount: 0, evaluationsCount: 0, spansCount: 0 },
  isLoading
}: ProjectCardProps) {
  return (
    <Link href={`/project/${project.id}/traces`} key={project.id}>
      <div className="hover:bg-secondary w-96 h-44 rounded-md bg-secondary/40 transition-all duration-100">
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium">{project.name}</p>
            <ChevronRightIcon className="w-4 text-secondary-foreground" />
          </div>
          <p className="text-muted-foreground font-mono text-xs">
            {project.id}
          </p>
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
                <div className="flex flex-col gap-1">
                  <p className="text-sm">Spans</p>
                  <p className="font-mono text-xl">{stats?.spansCount}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm">Evaluations</p>
                  <p className="font-mono text-xl">{stats?.evaluationsCount}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-sm">Datasets</p>
                  <p className="font-mono text-xl">{stats?.datasetsCount}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
