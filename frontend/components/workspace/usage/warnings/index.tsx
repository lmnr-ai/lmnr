"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { type WorkspaceUsageWarning } from "@/lib/actions/usage/usage-warnings";
import { swrFetcher } from "@/lib/utils";

import WarningChip, { AddWarningPopover } from "./warning-row";

interface WarningsSettingsProps {
  workspaceId: string;
}

const GB_IN_BYTES = 1024 * 1024 * 1024;

export default function WarningsSettings({ workspaceId }: WarningsSettingsProps) {
  const router = useRouter();
  const { data: warnings = [], mutate } = useSWR<WorkspaceUsageWarning[]>(
    `/api/workspaces/${workspaceId}/usage-warnings`,
    swrFetcher
  );

  const handleUpdate = useCallback(() => {
    mutate();
    router.refresh();
  }, [mutate, router]);

  const bytesWarnings = warnings.filter((w) => w.usageItem === "bytes").sort((a, b) => a.limitValue - b.limitValue);
  const signalStepsWarnings = warnings
    .filter((w) => w.usageItem === "signal_steps_processed")
    .sort((a, b) => a.limitValue - b.limitValue);

  const toDisplayGB = (raw: number) => Math.round((raw / GB_IN_BYTES) * 100) / 100;

  return (
    <SettingsSection>
      <SettingsSectionHeader
        size="sm"
        title="Email warnings"
        description="Get notified when your usage reaches a threshold. You can set multiple thresholds per meter."
      />
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-col rounded-md border flex-1">
          <div className="flex items-center px-3 h-10">
            <span className="text-sm font-medium">Data ingestion</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
            {bytesWarnings.map((w) => (
              <WarningChip
                key={w.id}
                workspaceId={workspaceId}
                id={w.id}
                displayValue={toDisplayGB(w.limitValue)}
                unit="GB"
                onRemove={handleUpdate}
              />
            ))}
            <AddWarningPopover
              workspaceId={workspaceId}
              usageItem="bytes"
              unit="GB"
              toRawValue={(display) => Math.round(display * GB_IN_BYTES)}
              onAdd={handleUpdate}
            />
          </div>
        </div>

        <div className="flex flex-col rounded-md border flex-1">
          <div className="flex items-center px-3 h-10">
            <span className="text-sm font-medium">Signal steps processed</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
            {signalStepsWarnings.map((w) => (
              <WarningChip
                key={w.id}
                workspaceId={workspaceId}
                id={w.id}
                displayValue={w.limitValue}
                unit="steps"
                onRemove={handleUpdate}
              />
            ))}
            <AddWarningPopover
              workspaceId={workspaceId}
              usageItem="signal_steps_processed"
              unit="steps"
              toRawValue={(display) => Math.round(display)}
              onAdd={handleUpdate}
            />
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}
