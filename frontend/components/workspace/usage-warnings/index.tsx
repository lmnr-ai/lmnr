"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { type WorkspaceUsageWarning } from "@/lib/actions/usage/usage-warnings";
import { swrFetcher } from "@/lib/utils";

import UsageWarningRow, { AddWarningForm } from "./usage-warning-row";

interface UsageWarningsSettingsProps {
  workspaceId: string;
}

const GB_IN_BYTES = 1024 * 1024 * 1024;

export default function UsageWarningsSettings({ workspaceId }: UsageWarningsSettingsProps) {
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
  const signalRunsWarnings = warnings
    .filter((w) => w.usageItem === "signal_runs")
    .sort((a, b) => a.limitValue - b.limitValue);

  const toDisplayGB = (raw: number) => Math.round((raw / GB_IN_BYTES) * 100) / 100;

  return (
    <>
      <SettingsSectionHeader
        title="Usage warnings"
        description="Get notified by email when your usage reaches a threshold. The workspace owner will receive the notification. You can set multiple thresholds per meter."
      />
      <SettingsSection>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Data ingestion</span>
            <span className="text-xs text-muted-foreground">
              Notify when data ingested in a billing cycle reaches these thresholds.
            </span>
            {bytesWarnings.map((w) => (
              <UsageWarningRow
                key={w.id}
                workspaceId={workspaceId}
                id={w.id}
                displayValue={toDisplayGB(w.limitValue)}
                unit="GB"
                onRemove={handleUpdate}
              />
            ))}
            <AddWarningForm
              workspaceId={workspaceId}
              usageItem="bytes"
              unit="GB"
              toRawValue={(display) => Math.round(display * GB_IN_BYTES)}
              onAdd={handleUpdate}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Signal runs</span>
            <span className="text-xs text-muted-foreground">
              Notify when signal runs in a billing cycle reach these thresholds.
            </span>
            {signalRunsWarnings.map((w) => (
              <UsageWarningRow
                key={w.id}
                workspaceId={workspaceId}
                id={w.id}
                displayValue={w.limitValue}
                unit="runs"
                onRemove={handleUpdate}
              />
            ))}
            <AddWarningForm
              workspaceId={workspaceId}
              usageItem="signal_runs"
              unit="runs"
              toRawValue={(display) => Math.round(display)}
              onAdd={handleUpdate}
            />
          </div>
        </div>
      </SettingsSection>
    </>
  );
}
