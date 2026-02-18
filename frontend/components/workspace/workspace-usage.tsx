import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { ChartContainer } from "@/components/ui/chart";
import { type WorkspaceStats } from "@/lib/usage/types";

interface WorkspaceUsageProps {
  workspaceStats: WorkspaceStats;
  isBillingEnabled: boolean;
}

const TIER_USAGE_HINTS: Record<
  string,
  {
    data: string;
    signalRuns: string;
    isOverageAllowed: boolean;
    overageDataPrice: number;
    overageSignalPrice: number;
    teamMembers: string;
  }
> = {
  free: {
    data: "1 GB",
    signalRuns: "100",
    isOverageAllowed: false,
    overageDataPrice: 0,
    overageSignalPrice: 0,
    teamMembers: "1",
  },
  hobby: {
    data: "3 GB",
    signalRuns: "1,000",
    isOverageAllowed: true,
    overageDataPrice: 2,
    overageSignalPrice: 0.02,
    teamMembers: "Unlimited",
  },
  pro: {
    data: "10 GB",
    signalRuns: "10,000",
    isOverageAllowed: true,
    overageDataPrice: 1.5,
    overageSignalPrice: 0.015,
    teamMembers: "Unlimited",
  },
};

export default function WorkspaceUsage({ workspaceStats, isBillingEnabled }: WorkspaceUsageProps) {
  const gbUsedThisMonth = workspaceStats?.gbUsedThisMonth ?? 0;
  const gbLimit = workspaceStats?.gbLimit ?? 1;
  const signalRunsUsed = workspaceStats?.signalRunsUsedThisMonth ?? 0;
  const signalRunsLimit = workspaceStats?.signalRunsLimit ?? 1;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const formatGB = (gb: number) => {
    if (gb < 0.01) {
      return `${(gb * 1024).toFixed(2)} MB`;
    }
    return `${gb.toFixed(2)} GB`;
  };

  const formatNumber = (num: number) => new Intl.NumberFormat("en-US").format(num);

  const tierKey = workspaceStats.tierName.toLowerCase().trim();
  const tierHintInfo = TIER_USAGE_HINTS[tierKey];
  const tierHint = `${workspaceStats.tierName} tier comes with ${tierHintInfo?.data ?? "unlimited"} data and ${tierHintInfo?.signalRuns ?? "unlimited"} signal runs per month.`;

  const tierHintOverages =
    "If you exceed these limits, " +
    (tierHintInfo?.isOverageAllowed
      ? `you will be charged $${tierHintInfo?.overageDataPrice ?? 2} per GB for additional data and $${tierHintInfo?.overageSignalPrice ?? 0.02} per signal run.`
      : "you won't be able to send any more data during current billing cycle.");

  return (
    <>
      <SettingsSectionHeader title="Usage" description="Monitor your workspace usage" />

      <SettingsSection>
        <SettingsSectionHeader size="sm" title="Usage summary" description={`${tierHint} ${tierHintOverages}`} />
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="border rounded-md p-6 bg-secondary flex-1 max-w-xs">
            <div className="flex justify-between items-center">
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

          <div className="border rounded-md p-6 bg-secondary flex-1 max-w-xs">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Signal runs</span>
                <span className="text-sm text-secondary-foreground">
                  {formatNumber(signalRunsUsed)} / {formatNumber(signalRunsLimit)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatter.format(signalRunsUsed / signalRunsLimit)} of limit used
                </span>
              </div>
              <UsageProgressDisc
                data={[{ fill: "hsl(var(--chart-2))", usage: signalRunsUsed }]}
                dataKey="usage"
                value={signalRunsUsed}
                maxValue={signalRunsLimit}
              />
            </div>
          </div>
        </div>
      </SettingsSection>

      {isBillingEnabled && (
        <SettingsSection>
          <div className="flex items-center gap-2 text-sm text-secondary-foreground">
            <span>Need to upgrade or manage your subscription?</span>
            <Link href="?tab=billing" className="text-primary hover:underline inline-flex items-center gap-1">
              Go to Billing
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </SettingsSection>
      )}
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
