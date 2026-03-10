"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import SlackConnectButton from "@/components/slack/slack-connect-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { type AlertTarget, type AlertWithDetails } from "@/lib/actions/alerts/types";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import CreateAlertSheet from "./create-alert-sheet";
import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "./settings-section";

interface AlertsSettingsProps {
  projectId: string;
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

interface SlackIntegrationInfo {
  id: string;
  teamName: string | null;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function groupTargetsByType(targets: AlertTarget[]): Map<string, AlertTarget[]> {
  const grouped = new Map<string, AlertTarget[]>();
  for (const target of targets) {
    const list = grouped.get(target.type) ?? [];
    list.push(target);
    grouped.set(target.type, list);
  }
  return grouped;
}

function getTargetLabel(target: AlertTarget): string {
  if (target.type === "slack") {
    return target.channelName ? `#${target.channelName}` : (target.channelId ?? "unknown");
  }
  if (target.type === "email") {
    return target.email ?? "unknown";
  }
  return target.channelId ?? target.type;
}

function TargetChips({ targets }: { targets: AlertTarget[] }) {
  const grouped = useMemo(() => groupTargetsByType(targets), [targets]);

  if (targets.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from(grouped.entries()).map(([type, items]) =>
        items.map((target) => (
          <Badge key={target.id} variant="outline" className="font-normal text-xs whitespace-nowrap">
            <span className="text-muted-foreground capitalize mr-1">{type}</span>
            {getTargetLabel(target)}
          </Badge>
        ))
      )}
    </div>
  );
}

export default function AlertsSettings({
  projectId,
  workspaceId,
  slackClientId,
  slackRedirectUri,
}: AlertsSettingsProps) {
  const { toast } = useToast();

  const { data: slackIntegration, isLoading: isLoadingSlack } = useSWR<SlackIntegrationInfo | null>(
    `/api/workspaces/${workspaceId}/slack`,
    swrFetcher
  );

  const {
    data: alertsList,
    isLoading: isLoadingAlerts,
    mutate: mutateAlerts,
  } = useSWR<AlertWithDetails[]>(`/api/projects/${projectId}/alerts`, swrFetcher);

  const [deleteTarget, setDeleteTarget] = useState<AlertWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/alerts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId: deleteTarget.id }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to delete" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to delete alert");
      }

      toast({ title: "Alert deleted" });
      await mutateAlerts();
    } catch (e) {
      toast({
        title: "Error deleting alert",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to delete alert",
      });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, projectId, mutateAlerts, toast]);

  if (isLoadingSlack) {
    return (
      <SettingsSection>
        <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />
        <Skeleton className="h-32 w-full" />
      </SettingsSection>
    );
  }

  if (!slackIntegration) {
    return (
      <SettingsSection>
        <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />
        <SettingsSection>
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <h2 className="text-lg font-semibold">Connect Slack to get started</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Connect your workspace to Slack to receive notifications.
            </p>
            <SlackConnectButton
              workspaceId={workspaceId}
              slackClientId={slackClientId}
              slackRedirectUri={slackRedirectUri}
              returnPath={`/project/${projectId}/settings?tab=alerts`}
            />
          </div>
        </SettingsSection>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />
      <SettingsSection>
        <div className="flex items-center justify-between">
          <CreateAlertSheet
            projectId={projectId}
            workspaceId={workspaceId}
            integrationId={slackIntegration.id}
            onCreated={() => mutateAlerts()}
          />
        </div>

        <SettingsTable
          isLoading={isLoadingAlerts}
          isEmpty={!alertsList || alertsList.length === 0}
          emptyMessage="No alerts yet. Click 'Alert' to create one."
          headers={["Name", "Targets", "Created", ""]}
        >
          {alertsList?.map((alert) => (
            <SettingsTableRow key={alert.id}>
              <td className="px-4 text-sm font-medium">{alert.name}</td>
              <td className="px-4">
                <TargetChips targets={alert.targets} />
              </td>
              <td className="px-4 text-xs text-muted-foreground">
                <ClientTimestampFormatter timestamp={alert.createdAt} absolute />
              </td>
              <td className="px-4">
                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(alert)}>
                  <Trash2 size={14} className="text-muted-foreground" />
                </Button>
              </td>
            </SettingsTableRow>
          ))}
        </SettingsTable>
      </SettingsSection>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete alert"
        description={
          deleteTarget
            ? `Are you sure you want to delete the alert "${deleteTarget.name}"? You will no longer receive notifications.`
            : ""
        }
        onConfirm={handleDelete}
        confirmText={isDeleting ? "Deleting..." : "Delete"}
      />
    </SettingsSection>
  );
}
