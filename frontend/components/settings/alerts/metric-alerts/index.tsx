"use client";

import { Activity, Plus } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type MetricAlert } from "@/lib/actions/alerts/metric-rule";
import { swrFetcher } from "@/lib/api/fetch-api";

import DeleteAlertDialog from "../delete-alert-dialog";
import { REFRESH_MS } from "./constants";
import MetricAlertCard from "./metric-alert-card";
import MetricAlertSheet from "./metric-alert-sheet";
import { useMetricAlertActions } from "./use-metric-alert-actions";

interface MetricAlertsProps {
  projectId: string;
  workspaceId: string;
  userEmail: string;
  /** False on plans without Slack delivery. */
  slackAvailable: boolean;
}

export default function MetricAlerts({ projectId, workspaceId, userEmail, slackAvailable }: MetricAlertsProps) {
  const {
    data: alerts,
    error,
    isLoading,
    mutate,
  } = useSWR<MetricAlert[]>(`/api/projects/${projectId}/alerts/metric`, swrFetcher, { refreshInterval: REFRESH_MS });
  const { pendingIds, setMuted } = useMetricAlertActions(projectId, mutate);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MetricAlert | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MetricAlert | null>(null);

  const openSheet = (alert: MetricAlert | null) => {
    setEditTarget(alert);
    setSheetOpen(true);
  };

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <Activity className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Metric alerts</h2>
        {!!alerts?.length && <span className="text-xs text-muted-foreground">{alerts.length}</span>}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1 text-muted-foreground"
          onClick={() => openSheet(null)}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>
      {isLoading && !alerts ? (
        <Skeleton className="h-36 w-full" />
      ) : error && !alerts ? (
        <p className="px-1 text-sm text-muted-foreground">Metric alerts could not be loaded.</p>
      ) : !alerts?.length ? (
        <button
          type="button"
          onClick={() => openSheet(null)}
          className="flex flex-col items-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors hover:overlay-hover"
        >
          <span className="text-sm text-muted-foreground">
            Get notified when cost, tokens, traffic, errors or latency cross a limit.
          </span>
          <span className="flex items-center gap-1 text-xs text-foreground">
            <Plus className="size-3.5" />
            Create a metric alert
          </span>
        </button>
      ) : (
        <TooltipProvider delayDuration={300}>
          {/* Grid rows stretch their cards, so every card in a row has the same height. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {alerts.map((alert) => (
              <MetricAlertCard
                key={alert.id}
                alert={alert}
                isToggling={pendingIds.has(alert.id)}
                onEdit={() => openSheet(alert)}
                onDelete={() => setDeleteTarget(alert)}
                onToggle={setMuted}
              />
            ))}
          </div>
        </TooltipProvider>
      )}

      <MetricAlertSheet
        projectId={projectId}
        workspaceId={workspaceId}
        userEmail={userEmail}
        slackAvailable={slackAvailable}
        alert={editTarget}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onSaved={() => mutate()}
      />
      <DeleteAlertDialog
        projectId={projectId}
        alert={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => mutate()}
      />
    </section>
  );
}
