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
      <Card className="hover:bg-secondary w-96 h-44 rounded-md bg-secondary/40 transition-all duration-200">
        <div className="p-4 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="font-medium truncate max-w-50">{project.name}</h4>
            <ChevronRightIcon className="w-4 text-secondary-foreground" />
          </div>
          <p className="text-gray-600 font-mono text-[10px]">{project.id}</p>
        </div>
      </Card>
    </Link>
  );
}
