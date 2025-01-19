import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { Project } from '@/lib/workspaces/types';

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/project/${project.id}/traces`} key={project.id}>
      <div className="hover:bg-secondary w-96 h-44 rounded-md bg-secondary/40 transition-all duration-100">
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium">{project.name}</p>
            <ChevronRightIcon className="w-4 text-secondary-foreground" />
          </div>
          <p className="text-muted-foreground font-mono text-xs">{project.id}</p>
        </div>
      </div>
    </Link>
  );
}
