"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PropsWithChildren } from "react";

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
    <div className={cn("font-medium flex items-center justify-between flex-none h-12 w-full pl-2.5 pr-4", className)}>
      <div className={cn("flex flex-1 items-center", childrenContainerClassName)}>
        {showSidebarTrigger && <SidebarTrigger className="hover:bg-secondary size-7" />}
        {segments.map((segment, index) => (
          <div key={index} className="flex items-center">
            {index > 0 && <div className="text-secondary-foreground/40">/</div>}
            {segment.href ? (
              <Link href={segment.href} className="hover:bg-muted rounded-lg px-2 p-0.5 text-secondary-foreground">
                {segment.name}
              </Link>
            ) : segment.copyValue !== undefined ? (
              <CopyTooltip value={segment.copyValue}>
                <div className="px-2">{segment.name}</div>
              </CopyTooltip>
            ) : (
              <div className="px-2">{segment.name}</div>
            )}
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}
