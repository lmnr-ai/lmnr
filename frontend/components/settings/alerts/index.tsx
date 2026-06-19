"use client";

import { isEmpty, isNil } from "lodash";
import { Ellipsis, Pen, Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import SlackConnectionCard, { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserContext } from "@/contexts/user-context";
import {
  ALERT_TYPE,
  ALERT_TYPE_LABELS,
  type AlertWithDetails,
  SEVERITY_LABELS,
  type SeverityLevel,
  type SignalEventAlertMetadata,
} from "@/lib/actions/alerts/types";
import { swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "../settings-section";
import DeleteAlertDialog from "./delete-alert-dialog";
import ManageAlertSheet from "./manage-alert-sheet";
import TargetChips from "./target-chips";

interface AlertsSettingsProps {
  projectId: string;
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function AlertsSettings({
  projectId,
  workspaceId,
  slackClientId,
  slackRedirectUri,
}: AlertsSettingsProps) {
  const { email: userEmail } = useUserContext();

  const { data: slackIntegration } = useSlackIntegration(workspaceId);

  const {
    data: alertsList,
    isLoading: isLoadingAlerts,
    mutate: mutateAlerts,
  } = useSWR<AlertWithDetails[]>(`/api/projects/${projectId}/alerts`, swrFetcher);

  const [deleteTarget, setDeleteTarget] = useState<AlertWithDetails | null>(null);
  const [editTarget, setEditTarget] = useState<AlertWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Alerts"
        description="Configure alerts for new events or clusters. Notifications can be sent to Slack and email."
      />

      <SlackConnectionCard
        workspaceId={workspaceId}
        slackClientId={slackClientId}
        slackRedirectUri={slackRedirectUri}
        returnPath={`/project/${projectId}/settings?tab=alerts`}
      />

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

      <SettingsTable
        isLoading={isLoadingAlerts}
        isEmpty={isNil(alertsList) || isEmpty(alertsList)}
        emptyMessage="No alerts configured. Create one to start receiving notifications."
        headers={["Name", "Trigger", "Signal", "Severity", "Send to", "Created", ""]}
        colSpan={7}
      >
        {alertsList?.map((alert) => {
          // Only show the current user's own email target + all non-email targets
          const visibleTargets = alert.targets.filter((t) => t.type !== "EMAIL" || t.email === userEmail);
          const signalEventMeta =
            alert.type === ALERT_TYPE.SIGNAL_EVENT ? (alert.metadata as SignalEventAlertMetadata) : null;
          return (
            <SettingsTableRow key={alert.id}>
              <td className="px-4 text-sm font-medium max-w-48">
                <span title={alert.name} className="block truncate">
                  {alert.name}
                </span>
              </td>
              <td className="px-4 align-middle">
                <div className="flex items-center">
                  <Badge variant="outline" className="font-normal text-xs whitespace-nowrap bg-secondary/50">
                    {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
                  </Badge>
                </div>
              </td>
              <td className="px-4 text-sm text-muted-foreground max-w-48">
                <span title={alert.signalName ?? undefined} className="block truncate">
                  {alert.signalName ?? "—"}
                </span>
              </td>
              <td className="px-4 text-xs text-muted-foreground">
                {alert.type === ALERT_TYPE.SIGNAL_EVENT
                  ? signalEventMeta?.severities && signalEventMeta.severities.length > 0
                    ? signalEventMeta.severities.map((s) => SEVERITY_LABELS[s as SeverityLevel]).join(", ")
                    : "Critical"
                  : "—"}
              </td>
              <td className="px-4">
                <TargetChips targets={visibleTargets} />
              </td>
              <td className="px-4 text-xs text-muted-foreground min-w-32">
                <ClientTimestampFormatter timestamp={alert.createdAt} absolute />
              </td>
              <td className="px-4 w-1/12">
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-muted-foreground">
                        <Ellipsis size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditTarget(alert);
                          setSheetOpen(true);
                        }}
                        className="cursor-pointer"
                      >
                        <Pen className="h-3.5 w-3.5 mr-1 text-inherit" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(alert)}
                        className="cursor-pointer text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1 text-inherit" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </SettingsTableRow>
          );
        })}
      </SettingsTable>

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
      />

      <DeleteAlertDialog
        projectId={projectId}
        alert={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => mutateAlerts()}
      />
    </SettingsSection>
  );
}
