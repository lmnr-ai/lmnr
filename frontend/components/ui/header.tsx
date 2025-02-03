"use client";

import Link from "next/link";
import { ReactNode } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { useWorkspaceContext } from "@/contexts/workspace-context";
import { cn } from "@/lib/utils";

import { Button } from "./button";

interface HeaderProps {
  path: string;
  children?: ReactNode;
  className?: string;
  showSidebarTrigger?: boolean;
}

export default function Header({ path, children, className, showSidebarTrigger = true }: HeaderProps) {
  const { project, workspace } = useWorkspaceContext();
  const segments = path.split("/");

  return (
    <div className={cn("font-medium flex items-center justify-between h-12 border-b overflow-auto", className)}>
      <div className="flex items-center">
        {showSidebarTrigger && <SidebarTrigger className="ml-2 -mr-2 hover:bg-secondary" />}
        {workspace?.name && (
          <div className="flex items-center pl-4 space-x-3 text-secondary-foreground">
            <p title={workspace.name} className="max-w-16 truncate">
              {workspace.name}
            </p>
            <div className="text-secondary-foreground/40">/</div>
          </div>
        )}
        {project?.name && (
          <div className="flex items-center pl-4 space-x-3 text-secondary-foreground">
            <p>{project?.name}</p>
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
                href={`/projects/${project?.id}/${segment.replace(/ /g, "-")}`}
                className="hover:bg-secondary rounded-lg px-2 mx-1 p-0.5 text-secondary-foreground"
              >
                {segment}
              </Link>
            )}
          </div>
        ))}
        {children}
      </div>
      <div className="flex pr-4 space-x-2">
        <Button variant="outline">
          <a href="https://cal.com/skull8888888/30min" target="_blank">
            Book a demo
          </a>
        </Button>
      </div>
    </div>
  );
}
