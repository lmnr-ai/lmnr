"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { type WorkspaceUsageLimit } from "@/lib/actions/usage/custom-usage-limits";
import { swrFetcher } from "@/lib/utils";

import UsageLimitRow from "./usage-limit-row";

interface UsageLimitsSettingsProps {
  workspaceId: string;
}

const GB_IN_BYTES = 1024 * 1024 * 1024;

export default function UsageLimitsSettings({ workspaceId }: UsageLimitsSettingsProps) {
  const router = useRouter();
  const { data: limits = [], mutate } = useSWR<WorkspaceUsageLimit[]>(
    `/api/workspaces/${workspaceId}/usage-limits`,
    swrFetcher
  );

  const handleUpdate = useCallback(() => {
    mutate();
    router.refresh();
  }, [mutate, router]);

  const bytesLimit = limits.find((l) => l.limitType === "bytes");
  const signalRunsLimit = limits.find((l) => l.limitType === "signal_runs");

  return (
    <>
      <SettingsSectionHeader
        title="Usage hard limits"
        description="Configure hard limits on your workspace usage. When a limit is reached, new data ingestion or signal runs will be rejected until the next billing cycle."
      />
      <SettingsSection>
        <UsageLimitRow
          workspaceId={workspaceId}
          limitType="bytes"
          label="Data ingestion"
          description="Maximum data that can be ingested per billing cycle."
          currentValue={bytesLimit?.limitValue ?? null}
          unit="GB"
          toDisplayValue={(raw) => Math.round((raw / GB_IN_BYTES) * 100) / 100}
          toRawValue={(display) => Math.round(display * GB_IN_BYTES)}
          onUpdate={handleUpdate}
        />
        <UsageLimitRow
          workspaceId={workspaceId}
          limitType="signal_runs"
          label="Signal runs"
          description="Maximum number of signal runs per billing cycle."
          currentValue={signalRunsLimit?.limitValue ?? null}
          unit="runs"
          toDisplayValue={(raw) => raw}
          toRawValue={(display) => Math.round(display)}
          onUpdate={handleUpdate}
        />
      </SettingsSection>
    </>
  );
}
