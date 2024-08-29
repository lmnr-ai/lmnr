import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Project } from '@/lib/workspaces/types';



interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link href={`/project/${project.id}/traces`} key={project.id}>
      <Card className="hover:bg-secondary w-64">

        <div className="p-4 space-y-1">
          <h4 className="font-semibold truncate max-w-50">{project.name}</h4>
          <p className="text-gray-600 font-mono text-[10px]">{project.id}</p>
        </div>
      </Card>
    </Link>
  );
}
