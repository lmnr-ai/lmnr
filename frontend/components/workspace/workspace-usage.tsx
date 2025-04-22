import { PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import { WorkspaceStats } from "@/lib/usage/types";
import { cn } from "@/lib/utils";
import { Workspace } from "@/lib/workspaces/types";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "../ui/dialog";
import PricingDialog from "./pricing-dialog";

interface WorkspaceUsageProps {
  workspace: Workspace;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
}

const TIER_SPAN_HINTS = {
  free: {
    spans: "50k",
    steps: "100",
    isOverageAllowed: false,
  },
  hobby: {
    spans: "100k",
    steps: "1000",
    isOverageAllowed: true,
  },
  pro: {
    spans: "200k",
    steps: "3000",
    isOverageAllowed: true,
  },
};

export default function WorkspaceUsage({ workspace, workspaceStats, isOwner }: WorkspaceUsageProps) {
  const spansThisMonth = workspaceStats?.spansThisMonth ?? 0;
  const spansLimit = workspaceStats?.spansLimit ?? 1;
  const stepsThisMonth = workspaceStats?.stepsThisMonth ?? 0;
  const stepsLimit = workspaceStats?.stepsLimit ?? 1;
  const resetTime = workspaceStats.resetTime;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const tierHintInfo = TIER_SPAN_HINTS[workspaceStats.tierName.toLowerCase().trim() as keyof typeof TIER_SPAN_HINTS];
  const tierHint =
    `${workspaceStats.tierName} tier comes with ${tierHintInfo.spans} spans and ` +
    `${tierHintInfo.steps} agent steps included per month.`;

  const tierHintOverages =
    "If you exceed this limit, " +
    (tierHintInfo.isOverageAllowed
      ? "you will be charged for overages."
      : "you won't be able to send any more spans during current billing cycle.");

  return (
    <div className="p-4 flex flex-col gap-4 w-2/3">
      <div className="flex items-center gap-2">
        Workspace tier
        <span
          className={cn(
            "text-xs text-secondary-foreground p-0.5 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20",
            {
              "border-primary bg-primary/10 text-primary": workspace.tierName === "Pro",
            }
          )}
        >
          {workspace.tierName}
        </span>{" "}
        |
        <div className="text-sm text-secondary-foreground">
          Monthly billing cycle started <ClientTimestampFormatter timestamp={resetTime} />
        </div>
      </div>

      {isOwner && (
        <Dialog>
          <DialogTrigger asChild>
            <Button className="self-start" variant="default">
              {workspaceStats.tierName.toLowerCase().trim() === "free" ? "Upgrade" : "Manage billing"}
            </Button>
          </DialogTrigger>
          <DialogTitle className="sr-only">Manage billing</DialogTitle>
          <DialogContent className="max-w-7xl">
            <PricingDialog
              workspaceTier={workspaceStats.tierName.toLowerCase().trim()}
              workspaceId={workspace.id}
              workspaceName={workspace.name}
            />
          </DialogContent>
        </Dialog>
      )}

      <div className="flex flex-col gap-8 mt-4">
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-lg">Usage Summary</span>
          <p className="text-secondary-foreground text-sm mb-2">
            {tierHint} <br />
            {tierHintOverages}
          </p>
        </div>
        <div className="grid grid-cols-1 max-w-xl md:grid-cols-2 sm:divide-y md:divide-y-0 md:divide-x">
          <div className="flex justify-between px-4 py-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm">Spans</span>
              <span className="text-sm text-secondary-foreground">
                {spansThisMonth} / {spansLimit} ({formatter.format(spansThisMonth / spansLimit)})
              </span>
            </div>
            <UsageProgressDisc
              data={[{ fill: "hsl(var(--chart-1))", spans: spansThisMonth }]}
              dataKey="spans"
              value={spansThisMonth}
              maxValue={spansLimit}
            />
          </div>
          <div className="flex justify-between px-4 py-2">
            <div className="flex flex-col gap-2">
              <span className="text-sm">Agent steps</span>
              <span className="text-sm text-secondary-foreground">
                {stepsThisMonth} / {stepsLimit} ({formatter.format(stepsThisMonth / stepsLimit)})
              </span>
            </div>
            <UsageProgressDisc
              data={[{ fill: "hsl(var(--chart-1))", steps: stepsThisMonth }]}
              dataKey="steps"
              value={stepsThisMonth}
              maxValue={stepsLimit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface UsageProgressDiscProps {
  value: number;
  maxValue: number;
  data: any[];
  dataKey: string;
}

const UsageProgressDisc = ({ maxValue, value, data, dataKey }: UsageProgressDiscProps) => {
  const endAngle = -90;
  const startAngle = endAngle + (Math.min(value, maxValue) / maxValue) * 360;

  return (
    <ChartContainer config={{}} className="aspect-square h-16 w-16">
      <RadialBarChart data={data} innerRadius={24} outerRadius={36} startAngle={startAngle} endAngle={endAngle}>
        <PolarGrid
          gridType="circle"
          radialLines={false}
          className="first:fill-muted last:fill-background"
          polarRadius={[25, 22]}
        />
        <RadialBar dataKey={dataKey} cornerRadius={50} />
        <PolarRadiusAxis tick={false} tickLine={false} axisLine={false} />
      </RadialBarChart>
    </ChartContainer>
  );
};
