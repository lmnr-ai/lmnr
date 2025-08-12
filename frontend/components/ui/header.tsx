"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PropsWithChildren } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useProjectContext } from "@/contexts/project-context";
import { cn } from "@/lib/utils";
import { Project } from "@/lib/workspaces/types";

interface HeaderProps {
  path: string;
  className?: string;
  childrenContainerClassName?: string;
  showSidebarTrigger?: boolean;
}

export default function Header({
  path,
  children,
  className,
  childrenContainerClassName,
  showSidebarTrigger = true,
}: PropsWithChildren<HeaderProps>) {
  const { project, workspace, projects } = useProjectContext();
  const { projectId } = useParams();
  const router = useRouter();

  const segments = path.split("/");

  const handleProjectSelect = (project: Project) => {
    if (project.id !== projectId) {
      router.push(`/project/${project.id}/traces`);
    }
  };

  return (
    <div className={`font-medium flex items-center justify-between flex-none h-12 border-b w-full ${className}`}>
      <div className={cn("flex flex-1 items-center", childrenContainerClassName)}>
        {showSidebarTrigger && <SidebarTrigger className="ml-2 -mr-2 hover:bg-secondary" />}
        {workspace && (
          <Link href="/projects" className="flex items-center pl-4 space-x-3 text-secondary-foreground max-w-32">
            <p title={workspace.name} className="truncate">
              {workspace.name}
            </p>
            <div className="text-secondary-foreground/40">/</div>
          </Link>
        )}
        {project && (
          <div className="flex items-center gap-1 ml-1 text-secondary-foreground">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center space-x-1 hover:bg-secondary rounded-lg px-2 py-1 transition-colors">
                <span>{project.name}</span>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {projects.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => handleProjectSelect(p)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <span>{p.name}</span>
                    {p.id === projectId && <Check className="h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="text-secondary-foreground/40">/</div>
          </div>
        )}
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && <div className="text-secondary-foreground/40">/</div>}
            {index === segments.length - 1 ? (
              <div className="px-3">{segment}</div>
            ) : (
              <Link
                href={`/project/${projectId}/${segment.replace(/ /g, "-")}`}
                className="hover:bg-secondary rounded-lg px-2 mx-1 p-0.5 text-secondary-foreground"
              >
                {segment}
              </Link>
            )}
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}
