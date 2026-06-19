"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { type WorkspaceUsageLimit } from "@/lib/actions/usage/custom-usage-limits";
import { swrFetcher } from "@/lib/utils";

import LimitRow from "./limit-row";

interface LimitsSettingsProps {
  workspaceId: string;
  tierIncludedDataGB: number;
  tierIncludedSignalSteps: number;
}

const GB_IN_BYTES = 1024 * 1024 * 1024;

export default function LimitsSettings({
  workspaceId,
  tierIncludedDataGB,
  tierIncludedSignalSteps,
}: LimitsSettingsProps) {
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
  const signalStepsLimit = limits.find((l) => l.limitType === "signal_steps_processed");

  return (
    <SettingsSection>
      <SettingsSectionHeader
        size="sm"
        title="Hard limits"
        description="When a limit is reached, new data ingestion or signal runs will be rejected until the next billing cycle."
      />
      <div className="flex flex-col sm:flex-row gap-3">
        <LimitRow
          workspaceId={workspaceId}
          limitType="bytes"
          label="Data ingestion"
          currentValue={bytesLimit?.limitValue ?? null}
          unit="GB"
          includedLabel={`${tierIncludedDataGB} GB`}
          toDisplayValue={(raw) => Math.round((raw / GB_IN_BYTES) * 100) / 100}
          toRawValue={(display) => Math.round(display * GB_IN_BYTES)}
          onUpdate={handleUpdate}
        />
        <LimitRow
          workspaceId={workspaceId}
          limitType="signal_steps_processed"
          label="Signal steps processed"
          currentValue={signalStepsLimit?.limitValue ?? null}
          unit="steps"
          includedLabel={`${new Intl.NumberFormat("en-US").format(tierIncludedSignalSteps)} steps`}
          toDisplayValue={(raw) => raw}
          toRawValue={(display) => Math.round(display)}
          onUpdate={handleUpdate}
        />
      </div>
    </SettingsSection>
  );
}
