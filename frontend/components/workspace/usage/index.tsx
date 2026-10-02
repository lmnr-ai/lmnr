"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { memo, useEffect } from "react";
import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { ChartContainer } from "@/components/ui/chart";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type WorkspaceStats } from "@/lib/actions/usage/types";
import {
  formatSignalTokenRate,
  normalizeTier,
  signalCacheReadRate,
  signalInputRate,
  signalOutputRate,
  TIERS,
} from "@/lib/billing/tiers";
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
  isOverageAllowed: boolean;
  overageDataPrice: number;
  teamMembers: string;
}

const TIER_USAGE_HINTS: Record<string, TierHint> = {
  free: {
    data: "1 GB",
    dataGB: 1,
    isOverageAllowed: false,
    overageDataPrice: 0,
    teamMembers: "1",
  },
  hobby: {
    data: "3 GB",
    dataGB: 3,
    isOverageAllowed: true,
    overageDataPrice: 2,
    teamMembers: "Unlimited",
  },
  pro: {
    data: "10 GB",
    dataGB: 10,
    isOverageAllowed: true,
    overageDataPrice: 1.5,
    teamMembers: "Unlimited",
  },
};

const DEFAULT_USAGE_DESCRIPTION = "Your workspace data and signal usage.";

// Keyed by the internal tier key ("hobby"), while DB rows may carry either the
// old "Hobby" or the new "Starter" display name.
const getTierUsageHint = (tierName: string): TierHint | null => {
  const key = tierName.toLowerCase().trim();
  return TIER_USAGE_HINTS[key === "starter" ? "hobby" : key] ?? null;
};

const getUsageDescription = (tierName?: string, signalCreditGrantedMicroUsd = 0): string => {
  if (!tierName) return DEFAULT_USAGE_DESCRIPTION;
  const tierHintInfo = getTierUsageHint(tierName);
  if (!tierHintInfo) return DEFAULT_USAGE_DESCRIPTION;
  const tier = normalizeTier(tierName);
  const creditHint =
    signalCreditGrantedMicroUsd > 0
      ? " This workspace also received a one-time $5 Signals credit that carries forward until used."
      : "";
  const tierHint = `${TIERS[tier].name} tier comes with ${tierHintInfo.data} data per month.${creditHint}`;
  const tierHintOverages = tierHintInfo.isOverageAllowed
    ? ` Additional usage costs $${tierHintInfo.overageDataPrice} per GB for data and ${formatSignalTokenRate(signalInputRate())} / 1M input tokens, ${formatSignalTokenRate(signalCacheReadRate())} / 1M cached input tokens, and ${formatSignalTokenRate(signalOutputRate())} / 1M output tokens for Signals.`
    : " Once a limit or credit is exhausted, upgrade to continue using it.";
  return `${tierHint}${tierHintOverages}`;
};

export default function WorkspaceUsage({ workspaceStats, workspace, isOwner }: WorkspaceUsageProps) {
  useEffect(() => {
    track("usage", "page_viewed");
  }, []);
  const featureFlags = useFeatureFlags();
  const tierHint = getTierUsageHint(workspace.tierName);
  const gbUsedThisMonth = workspaceStats?.gbUsedThisMonth ?? 0;
  const gbLimit = workspaceStats?.gbLimit ?? 0;
  const signalCostUsed = workspaceStats?.signalCostUsedThisMonth ?? 0;
  const signalCreditGranted = workspaceStats?.signalCreditGrantedMicroUsd ?? 0;
  const signalCreditRemaining = workspaceStats?.signalCreditRemainingMicroUsd ?? 0;

  const isUnlimited = !isFinite(gbLimit);
  const hasDataLimit = gbLimit > 0;
  const hasSignalCredit = signalCreditGranted > 0;

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

  const usageDescription = getUsageDescription(workspaceStats?.tierName, signalCreditGranted);

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
                  {!isUnlimited && hasDataLimit && ` / ${formatGB(gbLimit)}`}
                </span>
                {!isUnlimited && hasDataLimit && (
                  <span className="text-xs text-muted-foreground">
                    {formatter.format(safePercent(gbUsedThisMonth, gbLimit))} of limit used
                  </span>
                )}
              </div>
              {!isUnlimited && hasDataLimit && (
                <UsageProgressDisc color="hsl(var(--chart-1))" value={gbUsedThisMonth} maxValue={gbLimit} />
              )}
            </div>
          </div>

          <div className="border rounded-md p-6 bg-secondary">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Signals usage</span>
                <span className="text-sm text-secondary-foreground">
                  {formatSignalCost(signalCostUsed)} this billing period
                </span>
                {hasSignalCredit && (
                  <span className="text-xs text-muted-foreground">
                    {formatSignalCost(signalCreditRemaining)} of {formatSignalCost(signalCreditGranted)} one-time credit
                    remaining
                  </span>
                )}
              </div>
              {hasSignalCredit && (
                <UsageProgressDisc
                  color="hsl(var(--chart-2))"
                  value={signalCreditGranted - signalCreditRemaining}
                  maxValue={signalCreditGranted}
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
          tierIncludedSignalCostMicroUsd={0}
        />
      )}
    </>
  );
}

interface UsageProgressDiscProps {
  value: number;
  maxValue: number;
  color: string;
}

// The chart always sweeps a full circle and the value is encoded by the angle axis domain:
// recharts v3 fits the polar viewbox to the sweep, so a partial startAngle/endAngle would
// resize and re-centre the disc instead of filling part of it.
const UsageProgressDisc = memo(({ maxValue, value, color }: UsageProgressDiscProps) => (
  <ChartContainer config={{}} className="aspect-square h-16 w-16">
    <RadialBarChart
      data={[{ fill: color, usage: Math.min(value, maxValue) }]}
      startAngle={90}
      endAngle={-270}
      innerRadius="75%"
      outerRadius="100%"
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
    >
      <PolarAngleAxis type="number" domain={[0, maxValue]} tick={false} tickLine={false} axisLine={false} />
      <RadialBar dataKey="usage" background cornerRadius={10} />
    </RadialBarChart>
  </ChartContainer>
));

UsageProgressDisc.displayName = "UsageProgressDisc";
