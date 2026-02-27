"use client";

import { Database, Radio, SquareArrowOutUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useMemo } from "react";

import { getSidebarMenus } from "@/components/project/utils.ts";
import { Button } from "@/components/ui/button.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { type ProjectDetails } from "@/lib/actions/project";
import { cn } from "@/lib/utils.ts";

const UsageDisplay = ({ usageDetails, open }: { usageDetails: ProjectDetails; open: boolean }) => {
  const { gbLimit, gbUsedThisMonth, signalRunsLimit, signalRunsUsedThisMonth, workspaceId } = usageDetails;
  const formatGB = (gb: number) => {
    if (gb < 0.001) {
      return `${(gb * 1024).toFixed(0)} MB`;
    }
    return `${gb.toFixed(1)} GB`;
  };

  const formatRuns = (runs: number) => {
    if (runs >= 1_000_000) return `${(runs / 1_000_000).toFixed(1)}M`;
    if (runs >= 1_000) return `${(runs / 1_000).toFixed(1)}K`;
    return runs.toLocaleString();
  };

  const storagePercentage = gbLimit > 0 ? Math.min((gbUsedThisMonth / gbLimit) * 100, 100) : 0;
  const runsPercentage = signalRunsLimit > 0 ? Math.min((signalRunsUsedThisMonth / signalRunsLimit) * 100, 100) : 0;

  if (!open) return null;

  return (
    <div className="p-2 rounded-lg border bg-muted/30 text-xs flex flex-col gap-3">
      <div className="text-muted-foreground font-medium">Free plan</div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Database className="size-3.5" />
            Data
          </span>
          <span className="font-medium text-secondary-foreground">
            <span className="font-semibold">{formatGB(gbUsedThisMonth)}</span> / {formatGB(gbLimit)}
          </span>
        </div>
        <Progress
          value={storagePercentage}
          className="h-1.5 border"
          indicatorClassName={cn({ "bg-destructive": storagePercentage > 80 })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Radio className="size-3.5" />
            Signal runs
          </span>
          <span className="font-medium text-secondary-foreground">
            <span className="font-semibold">{formatRuns(signalRunsUsedThisMonth)}</span> / {formatRuns(signalRunsLimit)}
          </span>
        </div>
        <Progress
          value={runsPercentage}
          className="h-1.5 border"
          indicatorClassName={cn({ "bg-destructive": runsPercentage > 80 })}
        />
      </div>

      <Link href={`/workspace/${workspaceId}?tab=billing`}>
        <Button className="w-full">
          <span>Upgrade</span>
          <SquareArrowOutUpRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      </Link>
    </div>
  );
};

const ProjectSidebarContent = ({
  details,
  isSubscription,
  isSignals,
}: {
  details: ProjectDetails;
  isSubscription: boolean;
  isSignals: boolean;
}) => {
  const pathname = usePathname();
  const options = useMemo(
    () => getSidebarMenus(details.id).filter((m) => m.name !== "signals" || isSignals),
    [details.id, isSignals]
  );
  const { open, openMobile } = useSidebar();

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {options.map((option) => (
              <SidebarMenuItem className="h-7" key={option.name}>
                <SidebarMenuButton asChild isActive={pathname.startsWith(option.href)} tooltip={option.name}>
                  <Link href={option.href}>
                    <option.icon />
                    <span>{option.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {isSubscription && details.isFreeTier && (open || openMobile) && (
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <UsageDisplay usageDetails={details} open={open || openMobile} />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </SidebarContent>
  );
};

export default ProjectSidebarContent;
