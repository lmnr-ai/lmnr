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
import { ALERT_TYPE_LABELS, type AlertType, type AlertWithDetails } from "@/lib/actions/alerts/types";
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
  const { data: slackIntegration } = useSlackIntegration(workspaceId);

  const {
    data: alertsList,
    isLoading: isLoadingAlerts,
    mutate: mutateAlerts,
  } = useSWR<AlertWithDetails[]>(`/api/projects/${projectId}/alerts`, swrFetcher);

  const [deleteTarget, setDeleteTarget] = useState<AlertWithDetails | null>(null);
  const [editTarget, setEditTarget] = useState<AlertWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const alerts = useMemo(
    () => (fixedSignalId ? (alertsList ?? []).filter((a) => a.sourceId === fixedSignalId) : alertsList),
    [alertsList, fixedSignalId]
  );

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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {alerts?.map((alert) => {
            const visibleTargets = alert.targets.filter((t) => t.type !== "EMAIL" || t.email === userEmail);
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
                  "transition-colors hover:bg-muted/50",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity",
                      "hover:text-destructive-bright group-hover:opacity-100 focus-visible:opacity-100"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(alert);
                    }}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>

                <div className="flex flex-col gap-1 border-t pt-3">
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
