"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { type WorkspaceUsageWarning } from "@/lib/actions/usage/usage-warnings";
import { swrFetcher } from "@/lib/api/fetch-api";

import SurfaceCard from "../surface-card";
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
  const signalCostWarnings = warnings
    .filter((w) => w.usageItem === "signal_cost")
    .sort((a, b) => a.limitValue - b.limitValue);

  const toDisplayGB = (raw: number) => Math.round((raw / GB_IN_BYTES) * 100) / 100;
  // Signal warning thresholds are stored in micro-USD (1e-6 USD); show dollars.
  const toDisplaySignalUsd = (raw: number) => Math.round((raw / 1_000_000) * 100) / 100;

  return (
    <SettingsSection>
      <SettingsSectionHeader
        size="sm"
        title="Email warnings"
        description="Get an email when total usage this billing cycle reaches a threshold. Thresholds count from zero, and the one-time Signals credit doesn't shift them."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SurfaceCard title="Data ingestion">
          <div className="flex flex-wrap items-center gap-2">
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
        </SurfaceCard>

        <SurfaceCard title="Signals usage">
          <div className="flex flex-wrap items-center gap-2">
            {signalCostWarnings.map((w) => (
              <WarningChip
                key={w.id}
                workspaceId={workspaceId}
                id={w.id}
                displayValue={toDisplaySignalUsd(w.limitValue)}
                unit="USD"
                onRemove={handleUpdate}
              />
            ))}
            <AddWarningPopover
              workspaceId={workspaceId}
              usageItem="signal_cost"
              unit="USD"
              toRawValue={(display) => Math.round(display * 1_000_000)}
              onAdd={handleUpdate}
            />
          </div>
        </SurfaceCard>
      </div>
    </SettingsSection>
  );
}
