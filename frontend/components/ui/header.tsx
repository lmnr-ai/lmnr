"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PropsWithChildren } from "react";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

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
  const { projectId } = useParams();

  const segments = path.split("/");

  return (
    <div className={cn("font-medium flex items-center justify-between flex-none h-12 w-full pl-2.5 pr-4", className)}>
      <div className={cn("flex flex-1 items-center", childrenContainerClassName)}>
        {showSidebarTrigger && <SidebarTrigger className="hover:bg-secondary size-7" />}
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && <div className="text-secondary-foreground/40">/</div>}
            {index === segments.length - 1 ? (
              <div className="px-2">{segment}</div>
            ) : (
              <Link
                href={`/project/${projectId}/${segment.replace(/ /g, "-")}`}
                className="hover:bg-secondary rounded-lg px-2 p-0.5 text-secondary-foreground"
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
