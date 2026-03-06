"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { type PropsWithChildren } from "react";

import CopyTooltip from "@/components/ui/copy-tooltip.tsx";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

interface BreadcrumbSegment {
  name: string;
  href?: string;
  copyValue?: string;
}

interface HeaderProps {
  path: string | BreadcrumbSegment[];
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

  const segments: BreadcrumbSegment[] =
    typeof path === "string"
      ? path.split("/").map((segment, index, arr) => ({
          name: segment,
          href: index < arr.length - 1 ? `/project/${projectId}/${segment.replace(/ /g, "-")}` : undefined,
        }))
      : path;

  return (
    <div
      className={cn(
        "font-medium text-sm flex items-center justify-between flex-none h-10 w-full pl-2 pr-3 border-b border-border/60",
        className
      )}
    >
      <div className={cn("flex flex-1 items-center", childrenContainerClassName)}>
        {showSidebarTrigger && <SidebarTrigger className="hover:bg-accent size-7" />}
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && <div className="text-muted-foreground/50">/</div>}
            {segment.href ? (
              <Link
                href={segment.href}
                className="hover:bg-accent rounded px-1.5 py-0.5 text-muted-foreground transition-colors duration-150"
              >
                {segment.name}
              </Link>
            ) : segment.copyValue !== undefined ? (
              <CopyTooltip value={segment.copyValue}>
                <div className="px-1.5">{segment.name}</div>
              </CopyTooltip>
            ) : (
              <div className="px-1.5">{segment.name}</div>
            )}
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}
