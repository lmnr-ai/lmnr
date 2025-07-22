"use client";

import Link from "next/link";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useProjectContext } from "@/contexts/project-context";
import { cn } from "@/lib/utils";

interface HeaderProps {
  path: string;
  children?: React.ReactNode;
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
}: HeaderProps) {
  const { projectId, projectName } = useProjectContext();

  const segments = path.split("/");

  return (
    <div className={`font-medium flex items-center justify-between flex-none h-12 border-b w-full ${className}`}>
      <div className={cn("flex flex-1 items-center", childrenContainerClassName)}>
        {showSidebarTrigger && <SidebarTrigger className="ml-2 -mr-2 hover:bg-secondary" />}
        {projectName && (
          <div className="flex items-center pl-4 space-x-3 text-secondary-foreground">
            <p>{projectName}</p>
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
