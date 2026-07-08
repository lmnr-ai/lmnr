"use client";

import { capitalize } from "lodash";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { memo, useEffect } from "react";
import { PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { ChartContainer } from "@/components/ui/chart";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type WorkspaceStats } from "@/lib/actions/usage/types";
import { normalizeTier, signalInputRate, signalOutputRate } from "@/lib/billing/tiers";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";
import { type Workspace, WorkspaceTier } from "@/lib/workspaces/types";

import LimitsSettings from "./limits";
import WarningsSettings from "./warnings";

interface WorkspaceUsageProps {
  workspaceStats: WorkspaceStats | null;
  workspace: Workspace;
  isOwner: boolean;
}

interface TierHint {
  data: string;
  dataGB: number;
  // Included signal budget, displayed as a dollar amount (e.g. "$15").
  signalBudget: string;
  // Included signal budget in micro-USD (1e-6 USD) — matches the units stored
  // in subscription_tiers.signal_cost_included_micro_usd and the usage cache.
  signalBudgetMicroUsd: number;
  isOverageAllowed: boolean;
  overageDataPrice: number;
  teamMembers: string;
}

const TIER_USAGE_HINTS: Record<string, TierHint> = {
  free: {
    data: "1 GB",
    dataGB: 1,
    signalBudget: "$5",
    signalBudgetMicroUsd: 5_000_000,
    isOverageAllowed: false,
    overageDataPrice: 0,
    teamMembers: "1",
  },
  hobby: {
    data: "3 GB",
    dataGB: 3,
    signalBudget: "$15",
    signalBudgetMicroUsd: 15_000_000,
    isOverageAllowed: true,
    overageDataPrice: 2,
    teamMembers: "Unlimited",
  },
  pro: {
    data: "10 GB",
    dataGB: 10,
    signalBudget: "$50",
    signalBudgetMicroUsd: 50_000_000,
    isOverageAllowed: true,
    overageDataPrice: 1.5,
    teamMembers: "Unlimited",
  },
};

const DEFAULT_USAGE_DESCRIPTION = "Your workspace data and signal usage.";

const getUsageDescription = (tierName?: string): string => {
  if (!tierName) return DEFAULT_USAGE_DESCRIPTION;
  const tierHintInfo = TIER_USAGE_HINTS[tierName.toLowerCase().trim()];
  if (!tierHintInfo) return DEFAULT_USAGE_DESCRIPTION;
  const tier = normalizeTier(tierName);
  const tierHint = `${capitalize(tierName)} tier comes with ${tierHintInfo.data} data and ${tierHintInfo.signalBudget} of included Signals usage per month.`;
  const tierHintOverages =
    "If you exceed these limits, " +
    (tierHintInfo.isOverageAllowed
      ? `you will be charged $${tierHintInfo.overageDataPrice} per GB for additional data and $${signalInputRate(tier)} / 1M input tokens and $${signalOutputRate(tier)} / 1M output tokens for additional Signals usage.`
      : "you won't be able to send any more data during current billing cycle.");
  return `${tierHint} ${tierHintOverages}`;
};

export default function WorkspaceUsage({ workspaceStats, workspace, isOwner }: WorkspaceUsageProps) {
  useEffect(() => {
    track("usage", "page_viewed");
  }, []);
  const featureFlags = useFeatureFlags();
  const tierHint = TIER_USAGE_HINTS[workspace.tierName.toLowerCase().trim()] ?? null;
  const gbUsedThisMonth = workspaceStats?.gbUsedThisMonth ?? 0;
  const gbLimit = workspaceStats?.gbLimit ?? 0;
  const signalCostUsed = workspaceStats?.signalCostUsedThisMonth ?? 0;
  const signalCostLimit = workspaceStats?.signalCostLimit ?? 0;

  const isUnlimited = !isFinite(gbLimit);
  const hasLimits = gbLimit > 0 && signalCostLimit > 0;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const formatGB = (gb: number) => {
    if (!isFinite(gb)) return "Unlimited";
    if (gb === 0) return "0 GB";
    if (gb < 0.01) return `${(gb * 1024).toFixed(2)} MB`;
    return `${gb.toFixed(2)} GB`;
  };

  const safePercent = (used: number, limit: number) => {
    if (limit <= 0) return 0;
    return used / limit;
  };

  // Signal usage/limit values are micro-USD (1e-6 USD); render as dollars.
  const formatSignalCost = (microUsd: number) => {
    if (!isFinite(microUsd)) return "Unlimited";
    return `$${(microUsd / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const usageDescription = getUsageDescription(workspaceStats?.tierName);

  return (
    <>
      <SettingsSectionHeader title="Usage" description="Monitor your workspace usage" />

      <SettingsSection>
        <SettingsSectionHeader size="sm" title="Usage summary" description={usageDescription} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="border rounded-md p-6 bg-secondary">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Data usage</span>
                <span className="text-sm text-secondary-foreground">
                  {formatGB(gbUsedThisMonth)}
                  {!isUnlimited && hasLimits && ` / ${formatGB(gbLimit)}`}
                </span>
                {!isUnlimited && hasLimits && (
                  <span className="text-xs text-muted-foreground">
                    {formatter.format(safePercent(gbUsedThisMonth, gbLimit))} of limit used
                  </span>
                )}
              </div>
              {!isUnlimited && hasLimits && (
                <UsageProgressDisc
                  data={[{ fill: "hsl(var(--chart-1))", usage: gbUsedThisMonth }]}
                  dataKey="usage"
                  value={gbUsedThisMonth}
                  maxValue={gbLimit}
                />
              )}
            </div>
          </div>

          <div className="border rounded-md p-6 bg-secondary">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Signals usage</span>
                <span className="text-sm text-secondary-foreground">
                  {formatSignalCost(signalCostUsed)}
                  {!isUnlimited && hasLimits && ` / ${formatSignalCost(signalCostLimit)}`}
                </span>
                {!isUnlimited && hasLimits && (
                  <span className="text-xs text-muted-foreground">
                    {formatter.format(safePercent(signalCostUsed, signalCostLimit))} of limit used
                  </span>
                )}
              </div>
              {!isUnlimited && hasLimits && (
                <UsageProgressDisc
                  data={[{ fill: "hsl(var(--chart-2))", usage: signalCostUsed }]}
                  dataKey="usage"
                  value={signalCostUsed}
                  maxValue={signalCostLimit}
                />
              )}
            </div>
          </div>
        </div>
      </SettingsSection>

      {featureFlags[Feature.SUBSCRIPTION] && (
        <SettingsSection>
          <SettingsSectionHeader size="sm" title="Billing" description="Need to upgrade or manage your subscription?" />
          <Link
            href="?tab=billing"
            className="text-primary hover:underline inline-flex items-center gap-1 text-sm w-fit"
          >
            Go to Billing
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SettingsSection>
      )}

      {isOwner && workspace.tierName !== WorkspaceTier.FREE && <WarningsSettings workspaceId={workspace.id} />}

      {isOwner && workspace.tierName !== WorkspaceTier.FREE && tierHint && (
        <LimitsSettings
          workspaceId={workspace.id}
          tierIncludedDataGB={tierHint.dataGB}
          tierIncludedSignalCostMicroUsd={tierHint.signalBudgetMicroUsd}
        />
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
