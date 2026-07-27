"use client";

import { isEmpty, isNil } from "lodash";
import { Bell, Trash2 } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ALERT_TYPE_LABELS, type AlertType, type AlertWithDetails } from "@/lib/actions/alerts/types";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

import DeleteAlertDialog from "./delete-alert-dialog";
import ManageAlertSheet from "./manage-alert-sheet";
import TargetChips from "./target-chips";

interface AlertsManagerProps {
  projectId: string;
  workspaceId: string;
  userEmail: string;
  /** When set, only this signal's alerts are shown and new alerts are scoped to it. */
  fixedSignalId?: string;
}

function AlertTypeBadge({ type }: { type: AlertType }) {
  return (
    <Badge variant="outline" className="h-5 shrink-0 bg-secondary/50 px-1.5 text-[11px] font-normal whitespace-nowrap">
      {ALERT_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}

/** A label/value row inside an alert card, keeping configuration readable. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs font-medium leading-5 text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1 leading-5">{children}</div>
    </div>
  );
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
  const isEmptyState = !isLoadingAlerts && (isNil(alerts) || isEmpty(alerts));

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          icon="plus"
          className="w-fit"
          onClick={() => {
            setEditTarget(null);
            setSheetOpen(true);
          }}
        >
          Alert
        </Button>
      </div>

      {isLoadingEmpty ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : isEmptyState ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Bell className="size-5 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No alerts configured</p>
            <p className="text-xs text-muted-foreground">Create one to start receiving notifications.</p>
          </div>
        </div>
      ) : (
        <TooltipProvider delayDuration={300}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {alerts?.map((alert) => {
              const visibleTargets = alert.targets.filter((t) => t.type !== "EMAIL" || t.email === userEmail);
              const isDisabled = alert.metadata?.disabled === true;
              const isToggling = togglingIds.has(alert.id);
              return (
                <div
                  key={alert.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setEditTarget(alert);
                    setSheetOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditTarget(alert);
                      setSheetOpen(true);
                    }
                  }}
                  className={cn(
                    "group relative flex cursor-pointer flex-col gap-3 rounded-lg border border-border px-4.5 py-4",
                    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isDisabled ? "border-dashed bg-muted/20 hover:bg-muted/40" : "hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className={cn("flex min-w-0 flex-1 items-baseline gap-2", isDisabled && "opacity-60")}>
                      <span title={alert.name} className="truncate text-sm">
                        {alert.name}
                      </span>
                      {!fixedSignalId && alert.signalName && (
                        <>
                          <span aria-hidden className="shrink-0 text-muted-foreground">
                            ·
                          </span>
                          <span title={alert.signalName} className="truncate text-sm text-muted-foreground">
                            {alert.signalName}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button aria-label="Delete"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-5 w-0 shrink-0 overflow-hidden p-0 text-muted-foreground opacity-0 transition-all",
                          "hover:text-destructive-bright",
                          "group-hover:mr-2 group-hover:w-5 group-hover:opacity-100",
                          "focus-visible:mr-2 focus-visible:w-5 focus-visible:opacity-100"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(alert);
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div role="button" tabIndex={0}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="flex items-center"
                          >
                            <Switch
                              checked={!isDisabled}
                              disabled={isToggling}
                              onCheckedChange={(checked) => handleToggleDisabled(alert, !checked)}
                              aria-label={isDisabled ? "Enable alert" : "Disable alert"}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipPortal>
                          <TooltipContent>{isDisabled ? "Enable alert" : "Disable alert"}</TooltipContent>
                        </TooltipPortal>
                      </Tooltip>
                    </div>
                  </div>

                  <div className={cn("flex flex-col gap-1 border-t pt-3", isDisabled && "opacity-60")}>
                    <DetailRow label="Source">
                      <AlertTypeBadge type={alert.type} />
                    </DetailRow>
                    <DetailRow label="Send to">
                      <TargetChips targets={visibleTargets} compact />
                    </DetailRow>
                    <DetailRow label="Created">
                      <ClientTimestampFormatter
                        timestamp={alert.createdAt}
                        absolute
                        className="text-xs leading-5 text-muted-foreground"
                      />
                    </DetailRow>
                  </div>
                </div>
              );
            })}
          </div>
        </TooltipProvider>
      )}

      <ManageAlertSheet
        projectId={projectId}
        workspaceId={workspaceId}
        integrationId={slackIntegration?.id}
        alert={editTarget}
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
