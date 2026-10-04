"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type UsageBreakdown, type WorkspaceStats } from "@/lib/actions/usage/types";
import { TIERS } from "@/lib/billing/tiers";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";
import { swrFetcher } from "@/lib/utils";
import { type Workspace, WorkspaceTier } from "@/lib/workspaces/types";

import LimitsSettings from "./limits";
import UsageMeterCard from "./meter";
import PlanOverview from "./plan-overview";
import { dataStatRows, signalStatRows } from "./usage-stats";
import {
  buildUsageModel,
  DATA_COLOR,
  formatDay,
  formatGB,
  formatGBTick,
  formatUsd,
  formatUsdTick,
  GB_IN_BYTES,
  SIGNALS_COLOR,
} from "./utils";
import WarningsSettings from "./warnings";

const NO_DAYS: UsageBreakdown["days"] = [];

interface WorkspaceUsageProps {
  workspaceStats: WorkspaceStats | null;
  workspace: Workspace;
  isOwner: boolean;
}

export default function WorkspaceUsage({ workspaceStats, workspace, isOwner }: WorkspaceUsageProps) {
  useEffect(() => {
    track("usage", "page_viewed");
  }, []);
  const featureFlags = useFeatureFlags();
  const { data: breakdown, error } = useSWR<UsageBreakdown>(
    `/api/workspaces/${workspace.id}/usage-breakdown`,
    swrFetcher
  );

  const model = useMemo(() => buildUsageModel(workspaceStats, breakdown), [workspaceStats, breakdown]);
  const { tier, cycle, bill } = model;
  const isPaid = tier === "hobby" || tier === "pro";
  const daysLeft = Math.ceil(cycle.remainingDays);

  // On error, render empty charts rather than an endless skeleton.
  const days = breakdown?.days ?? (error ? NO_DAYS : undefined);
  const dataDays = useMemo(() => days?.map((d) => ({ date: d.date, value: d.bytes / GB_IN_BYTES })), [days]);
  const signalDays = useMemo(
    () => days?.map((d) => ({ date: d.date, value: d.signalCostMicroUsd / 1_000_000 })),
    [days]
  );

  const cycleRange = `${formatDay(cycle.start)} – ${formatDay(cycle.end)} · resets in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
  const cycleLabel = `Billing cycle ${cycleRange}`;

  return (
    <>
      <SettingsSectionHeader title="Usage" description="Monitor your workspace usage" />

      {isPaid && bill && <PlanOverview tier={tier} bill={bill} model={model} period={cycleRange} />}

      <SettingsSection>
        {!(isPaid && bill) && (
          <p className="text-sm text-muted-foreground">
            {tier === "free"
              ? `${cycleLabel}. The Free plan is never billed — data stops once the included amount is used up, and Signals once the one-time credit is.`
              : cycleLabel}
          </p>
        )}
        {error && <p className="text-sm text-destructive">Failed to load daily usage.</p>}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UsageMeterCard
            title="Data ingestion"
            meter={model.data}
            days={dataDays}
            cycle={cycle}
            color={DATA_COLOR}
            format={formatGB}
            formatTick={formatGBTick}
            stats={dataStatRows(dataDays, formatGB)}
          />
          <UsageMeterCard
            title="Signals usage"
            meter={model.signals}
            days={signalDays}
            cycle={cycle}
            color={SIGNALS_COLOR}
            format={formatUsd}
            formatTick={formatUsdTick}
            stats={signalStatRows(breakdown, !!error)}
          />
        </div>
      </SettingsSection>

      {featureFlags[Feature.SUBSCRIPTION] && !isPaid && (
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

      {isOwner && workspace.tierName !== WorkspaceTier.FREE && tier && (
        <LimitsSettings
          workspaceId={workspace.id}
          tierIncludedDataGB={model.data.included ?? TIERS[tier].includedBytesGB}
          tierIncludedSignalCostMicroUsd={(model.signals.included ?? 0) * 1_000_000}
        />
      )}
    </>
  );
}
