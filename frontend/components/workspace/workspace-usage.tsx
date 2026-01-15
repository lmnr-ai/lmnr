import { memo } from "react";
import { PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { ChartContainer } from "@/components/ui/chart";
import { type WorkspaceStats } from "@/lib/usage/types";
import { cn } from "@/lib/utils";
import { type Workspace } from "@/lib/workspaces/types";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../ui/dialog";
import PricingDialog from "./pricing-dialog";

interface WorkspaceUsageProps {
  workspace: Workspace;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
}

const TIER_USAGE_HINTS = {
  free: {
    data: "1GB",
    isOverageAllowed: false,
  },
  hobby: {
    data: "2GB",
    isOverageAllowed: true,
  },
  pro: {
    data: "5GB",
    isOverageAllowed: true,
  },
};

export default function WorkspaceUsage({ workspace, workspaceStats, isOwner }: WorkspaceUsageProps) {
  const gbUsedThisMonth = workspaceStats?.gbUsedThisMonth ?? 0;
  const gbLimit = workspaceStats?.gbLimit ?? 1;
  const resetTime = workspaceStats.resetTime;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const formatGB = (gb: number) => {
    if (gb < 0.001) {
      return `${(gb * 1024).toFixed(2)} MB`;
    }
    return `${gb.toFixed(2)} GB`;
  };

  const tierHintInfo = TIER_USAGE_HINTS[workspaceStats.tierName.toLowerCase().trim() as keyof typeof TIER_USAGE_HINTS];
  const tierHint = `${workspaceStats.tierName} tier comes with ${tierHintInfo?.data ?? "unlimited"} data per month.`;

  const tierHintOverages =
    "If you exceed this limit, " +
    (tierHintInfo?.isOverageAllowed
      ? "you will be charged $2 per GB for additional data."
      : "you won't be able to send any more data during current billing cycle.");

  return (
    <>
      <SettingsSectionHeader title="Usage & Billing" description="Manage your workspace plan and monitor usage" />
      <SettingsSection>
        <SettingsSectionHeader
          size="sm"
          title="Workspace plan"
          description={`Monthly billing cycle started ${new Date(resetTime).toLocaleDateString()}`}
        />
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-secondary-foreground">Current tier:</span>
            <span
              className={cn(
                "text-xs text-secondary-foreground p-0.5 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20",
                {
                  "border-primary bg-primary/10 text-primary": workspace.tierName === "Pro",
                }
              )}
            >
              {workspace.tierName}
            </span>
          </div>
        </div>
        {isOwner && (
          <Dialog>
            <DialogTrigger asChild>
              <Button className="w-fit" variant="default">
                {workspaceStats.tierName.toLowerCase().trim() === "free" ? "Upgrade" : "Manage billing"}
              </Button>
            </DialogTrigger>
            <DialogTitle className="sr-only">Manage billing</DialogTitle>
            <DialogContent className="max-w-[90vw] p-0 border-none">
              <PricingDialog
                workspaceTier={workspaceStats.tierName.toLowerCase().trim()}
                workspaceId={workspace.id}
                workspaceName={workspace.name}
              />
            </DialogContent>
          </Dialog>
        )}
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader size="sm" title="Usage summary" description={`${tierHint} ${tierHintOverages}`} />
        <div className="border rounded-md p-6 bg-secondary max-w-md">
          <div className="flex justify-between items-center max-w-md">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Data usage</span>
              <span className="text-sm text-secondary-foreground">
                {formatGB(gbUsedThisMonth)} / {formatGB(gbLimit)}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatter.format(gbUsedThisMonth / gbLimit)} of limit used
              </span>
            </div>
            <UsageProgressDisc
              data={[{ fill: "hsl(var(--chart-1))", usage: gbUsedThisMonth }]}
              dataKey="usage"
              value={gbUsedThisMonth}
              maxValue={gbLimit}
            />
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

interface UsageProgressDiscProps {
  value: number;
  maxValue: number;
  data: any[];
  dataKey: string;
}

const UsageProgressDisc = memo(({ maxValue, value, data, dataKey }: UsageProgressDiscProps) => {
  const startAngle = 90;
  const endAngle = startAngle - (Math.min(value, maxValue) / maxValue) * 360;

  return (
    <ChartContainer config={{}} className="aspect-square h-16 w-16">
      <RadialBarChart data={data} innerRadius={24} outerRadius={36} startAngle={startAngle} endAngle={endAngle}>
        <PolarGrid
          gridType="circle"
          radialLines={false}
          className="first:fill-muted last:fill-sidebar"
          polarRadius={[25, 22]}
        />
        <RadialBar dataKey={dataKey} cornerRadius={50} />
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false} />
      </RadialBarChart>
    </ChartContainer>
  );
});

UsageProgressDisc.displayName = "UsageProgressDisc";
