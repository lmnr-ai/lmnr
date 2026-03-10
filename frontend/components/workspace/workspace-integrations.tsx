"use client";

import { Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import {
  SettingsSection,
  SettingsSectionHeader,
  SettingsTable,
  SettingsTableRow,
} from "@/components/settings/settings-section";
import SlackConnectButton from "@/components/slack/slack-connect-button";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { type AlertWithDetails } from "@/lib/actions/alerts/types";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";
import { type Project } from "@/lib/workspaces/types";

import CreateAlertDialog from "./create-alert-dialog";

interface SlackIntegration {
  id: string;
  teamName: string | null;
  createdAt: string;
}

interface WorkspaceIntegrationsProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function WorkspaceIntegrations({
  workspaceId,
  slackClientId,
  slackRedirectUri,
}: WorkspaceIntegrationsProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [filterProjectId, setFilterProjectId] = useState<string>("all");
  const [deleteTarget, setDeleteTarget] = useState<AlertWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: slackIntegration, isLoading: isFetchingSlack } = useSWR<SlackIntegration | null>(
    `/api/workspaces/${workspaceId}/slack`,
    swrFetcher
  );

  const {
    data: alertsList,
    isLoading: isLoadingAlerts,
    mutate: mutateAlerts,
  } = useSWR<AlertWithDetails[]>(
    slackIntegration ? `/api/workspaces/${workspaceId}/alerts` : null,
    swrFetcher
  );

  const { data: projects } = useSWR<Project[]>(
    slackIntegration ? `/api/workspaces/${workspaceId}/projects` : null,
    swrFetcher
  );

  const filteredAlerts = useMemo(() => {
    if (!alertsList) return [];
    if (filterProjectId === "all") return alertsList;
    return alertsList.filter((a) => a.projectId === filterProjectId);
  }, [alertsList, filterProjectId]);

  const renderSlackStatus = useCallback(() => {
    if (isFetchingSlack) {
      return <Skeleton className="h-8 w-32" />;
    }

    if (slackIntegration) {
      return (
        <Badge className="py-1.5 border-success bg-success/80" variant="outline">
          Connected{slackIntegration.teamName ? ` to ${slackIntegration.teamName}` : ""}
        </Badge>
      );
    }

    return (
      <SlackConnectButton workspaceId={workspaceId} slackClientId={slackClientId} slackRedirectUri={slackRedirectUri} />
    );
  }, [isFetchingSlack, slackIntegration, workspaceId, slackClientId, slackRedirectUri]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/alerts`, {
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
  }, [deleteTarget, workspaceId, mutateAlerts, toast]);

  return (
    <>
      <SettingsSectionHeader title="Integrations" description="Manage your workspace integrations" />
      <div className="flex flex-col gap-8">
        <SettingsSection>
          <SettingsSectionHeader
            title="Slack Integration"
            description="Add Slack integration to receive notifications in Slack."
            size="sm"
          />
          <div className="flex flex-col items-start gap-2">
            {renderSlackStatus()}
            {searchParams.get("slack") === "error" && (
              <span className="text-destructive text-xs">Failed to connect to slack. Please try again.</span>
            )}
          </div>
        </SettingsSection>

        {slackIntegration && (
          <SettingsSection>
            <div className="flex items-center justify-between">
              <SettingsSectionHeader
                title="Alert Subscriptions"
                description="Receive Slack notifications when signal events are triggered."
                size="sm"
              />
              <CreateAlertDialog
                workspaceId={workspaceId}
                integrationId={slackIntegration.id}
                onCreated={() => mutateAlerts()}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Filter by project:</span>
              <Select value={filterProjectId} onValueChange={setFilterProjectId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {projects?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <SettingsTable
              isLoading={isLoadingAlerts}
              isEmpty={filteredAlerts.length === 0}
              emptyMessage="No alerts yet. Click 'Alert' to create one."
            >
              <SettingsTableRow>
                <th className="text-left text-xs font-medium text-muted-foreground p-2">Signal</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-2">Project</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-2">Channel</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-2">Created</th>
                <th className="w-10 p-2" />
              </SettingsTableRow>
              {filteredAlerts.map((alert) => (
                <SettingsTableRow key={alert.id}>
                  <td className="p-2 text-sm font-mono">{alert.name}</td>
                  <td className="p-2 text-sm">{alert.projectName}</td>
                  <td className="p-2 text-sm text-muted-foreground">
                    {alert.targets.map((t) => t.channelName ? `#${t.channelName}` : t.channelId).join(", ") || "—"}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{dateFormatter.format(new Date(alert.createdAt))}</td>
                  <td className="p-2">
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(alert)}>
                      <Trash2 size={14} className="text-muted-foreground" />
                    </Button>
                  </td>
                </SettingsTableRow>
              ))}
            </SettingsTable>
          </SettingsSection>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete alert"
        description={
          deleteTarget
            ? `Are you sure you want to delete the alert for "${deleteTarget.name}"? You will no longer receive notifications for this signal.`
            : ""
        }
        onConfirm={handleDelete}
        confirmText={isDeleting ? "Deleting..." : "Delete"}
      />
    </>
  );
}
