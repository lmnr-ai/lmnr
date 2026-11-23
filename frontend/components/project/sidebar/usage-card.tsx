"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { SidebarMenuItem } from "@/components/ui/sidebar.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { type ProjectDetails } from "@/lib/actions/project";

interface UsageCardProps {
  usageDetails: ProjectDetails;
}

export default function UsageCard({ usageDetails }: UsageCardProps) {
  const { settingsHref } = useProjectContext();
  // Shown only on Free, which has no Signals, so data is the only meter.
  const { gbLimit, gbUsedThisMonth } = usageDetails;
  const formatGB = (gb: number) => {
    if (gb < 0.001) {
      return `${(gb * 1024).toFixed(0)} MB`;
    }
    return `${gb.toFixed(1)} GB`;
  };

  const storagePercentage = gbLimit > 0 ? Math.min((gbUsedThisMonth / gbLimit) * 100, 100) : 0;

  return (
    <SidebarMenuItem>
      <div className="flex flex-col gap-0.5 overflow-hidden rounded-[8px] bg-surface-400 text-xs">
        <div className="flex flex-col gap-2 px-3 pt-[10px]">
          <div className="flex items-start justify-between">
            <span className="text-foreground">Data</span>
            <span className="text-secondary-foreground">
              {formatGB(gbUsedThisMonth)} / {formatGB(gbLimit)}
            </span>
          </div>
          <Progress
            value={storagePercentage}
            className="h-1 border-0 bg-surface-500"
            indicatorClassName="bg-primary-400"
          />
        </div>
        <div className="p-2">
          <Link href={settingsHref("billing")}>
            <Button className="w-full">
              <span>Upgrade</span>
              <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </SidebarMenuItem>
  );
}
