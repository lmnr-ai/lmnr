"use client";

import { isEmpty, isNil } from "lodash";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ALERT_TYPE, type AlertType, type AlertWithDetails } from "@/lib/actions/alerts/types";
import { swrFetcher } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";

import AlertRow from "./alert-row";
import AlertSections from "./alert-sections";
import DeleteAlertDialog from "./delete-alert-dialog";
import ManageAlertSheet from "./manage-alert-sheet";

interface AlertsManagerProps {
  projectId: string;
  workspaceId: string;
  userEmail: string;
  /** When set, only this signal's alerts are shown and new alerts are scoped to it. */
  fixedSignalId?: string;
}

export default function AlertsManager({ projectId, workspaceId, userEmail, fixedSignalId }: AlertsManagerProps) {
  const { toast } = useToast();
  const { data: slackIntegration } = useSlackIntegration(workspaceId);

  const {
    data: alertsList,
    isLoading: isLoadingAlerts,
    mutate: mutateAlerts,
  } = useSWR<AlertWithDetails[]>(`/api/projects/${projectId}/alerts`, swrFetcher);

  const [deleteTarget, setDeleteTarget] = useState<AlertWithDetails | null>(null);
  const [editTarget, setEditTarget] = useState<AlertWithDetails | null>(null);
  const [createType, setCreateType] = useState<AlertType>(ALERT_TYPE.SIGNAL_EVENT);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const alerts = useMemo(
    () => (fixedSignalId ? (alertsList ?? []).filter((a) => a.sourceId === fixedSignalId) : alertsList),
    [alertsList, fixedSignalId]
  );

  const handleToggleDisabled = async (alert: AlertWithDetails, disabled: boolean) => {
    if (togglingIds.has(alert.id)) return;

    // Absence of `disabled` means active; disabling sets it true, enabling drops the key.
    const nextMetadata = { ...alert.metadata };
    if (disabled) nextMetadata.disabled = true;
    else delete nextMetadata.disabled;

    const applyToggle = (list?: AlertWithDetails[]) =>
      (list ?? []).map((a) => (a.id === alert.id ? { ...a, metadata: nextMetadata } : a));

    setTogglingIds((prev) => new Set(prev).add(alert.id));
    try {
      await mutateAlerts(
        async () => {
          const res = await fetch(`/api/projects/${projectId}/alerts/${alert.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "toggleDisabled", disabled }),
          });
          if (!res.ok) {
            const errMessage = await res
              .json()
              .then((d) => d?.error)
              .catch(() => null);
            throw new Error(errMessage ?? "Failed to update alert.");
          }
          return applyToggle(alertsList);
        },
        { optimisticData: applyToggle, rollbackOnError: true, revalidate: false }
      );
      toast({
        title: disabled ? "Alert disabled" : "Alert enabled",
        description: `"${alert.name}" will ${disabled ? "no longer send" : "now send"} notifications.`,
        duration: 1500,
      });
    } catch (error) {
      toast({ variant: "destructive", title: error instanceof Error ? error.message : "Something went wrong" });
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(alert.id);
        return next;
      });
    }
  };

  const isLoadingEmpty = isLoadingAlerts && (isNil(alerts) || isEmpty(alerts));

  const openCreate = (type: AlertType) => {
    setEditTarget(null);
    setCreateType(type);
    setSheetOpen(true);
  };
  const openEdit = (alert: AlertWithDetails) => {
    setEditTarget(alert);
    setSheetOpen(true);
  };

  return (
    <div className="flex flex-col gap-4 pb-16">
      {isLoadingEmpty ? (
        <div className="flex flex-col divide-y rounded-md border">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <TooltipProvider delayDuration={300}>
          <AlertSections
            alerts={alerts ?? []}
            onCreate={openCreate}
            renderRow={(alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                userEmail={userEmail}
                hideSignal={!!fixedSignalId}
                isToggling={togglingIds.has(alert.id)}
                onEdit={() => openEdit(alert)}
                onDelete={() => setDeleteTarget(alert)}
                onToggle={handleToggleDisabled}
              />
            )}
          />
        </TooltipProvider>
      )}

      <ManageAlertSheet
        projectId={projectId}
        workspaceId={workspaceId}
        integrationId={slackIntegration?.id}
        alert={editTarget}
        defaultType={createType}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditTarget(null);
        }}
        onSaved={() => {
          mutateAlerts();
          setSheetOpen(false);
          setEditTarget(null);
        }}
        userEmail={userEmail}
        fixedSignalId={fixedSignalId}
      />

      <DeleteAlertDialog
        projectId={projectId}
        alert={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => mutateAlerts()}
      />
    </div>
  );
}
