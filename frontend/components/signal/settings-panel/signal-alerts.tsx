"use client";

import { isEmpty, isNil } from "lodash";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import DeleteAlertDialog from "@/components/settings/alerts/delete-alert-dialog";
import ManageAlertSheet from "@/components/settings/alerts/manage-alert-sheet";
import TargetChips from "@/components/settings/alerts/target-chips";
import { SettingsTable, SettingsTableRow } from "@/components/settings/settings-section";
import SlackConnectionCard, { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { Button } from "@/components/ui/button";
import { useUserContext } from "@/contexts/user-context";
import {
  ALERT_TYPE,
  type AlertWithDetails,
  SEVERITY_LABELS,
  type SeverityLevel,
  type SignalEventAlertMetadata,
} from "@/lib/actions/alerts/types";
import { swrFetcher } from "@/lib/utils";

interface SignalAlertsProps {
  projectId: string;
  workspaceId: string;
  signal: { id: string; name: string };
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function SignalAlerts({
  projectId,
  workspaceId,
  signal,
  slackClientId,
  slackRedirectUri,
}: SignalAlertsProps) {
  const { email: userEmail } = useUserContext();
  const { data: slackIntegration } = useSlackIntegration(workspaceId);

  const {
    data: alertsList,
    isLoading,
    mutate,
  } = useSWR<AlertWithDetails[]>(`/api/projects/${projectId}/alerts`, swrFetcher);

  const [deleteTarget, setDeleteTarget] = useState<AlertWithDetails | null>(null);
  const [editTarget, setEditTarget] = useState<AlertWithDetails | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const signalAlerts = (alertsList ?? []).filter((a) => a.sourceId === signal.id);

  return (
    <div className="flex flex-col gap-4">
      <SlackConnectionCard
        workspaceId={workspaceId}
        slackClientId={slackClientId}
        slackRedirectUri={slackRedirectUri}
        returnPath={`/project/${projectId}/signals/${signal.id}?tab=settings`}
      />

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

      <SettingsTable
        isLoading={isLoading}
        isEmpty={isNil(alertsList) || isEmpty(signalAlerts)}
        emptyMessage="No alerts for this signal. Create one to start receiving notifications."
        headers={["Name", "Severity", "Send to", "Created", ""]}
        colSpan={5}
      >
        {signalAlerts.map((alert) => {
          const visibleTargets = alert.targets.filter((t) => t.type !== "EMAIL" || t.email === userEmail);
          const signalEventMeta =
            alert.type === ALERT_TYPE.SIGNAL_EVENT ? (alert.metadata as SignalEventAlertMetadata) : null;
          return (
            <SettingsTableRow
              key={alert.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => {
                setEditTarget(alert);
                setSheetOpen(true);
              }}
            >
              <td className="px-4 text-sm font-medium max-w-48">
                <span title={alert.name} className="block truncate">
                  {alert.name}
                </span>
              </td>
              <td className="px-4 text-xs text-muted-foreground">
                {signalEventMeta?.severities && signalEventMeta.severities.length > 0
                  ? signalEventMeta.severities.map((s) => SEVERITY_LABELS[s as SeverityLevel]).join(", ")
                  : "Critical"}
              </td>
              <td className="px-4">
                <TargetChips targets={visibleTargets} />
              </td>
              <td className="px-4 text-xs text-muted-foreground min-w-32">
                <ClientTimestampFormatter timestamp={alert.createdAt} absolute />
              </td>
              <td className="px-4 w-1/12">
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(alert);
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
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
          mutate();
          setSheetOpen(false);
          setEditTarget(null);
        }}
        userEmail={userEmail}
        lockedSignal={signal}
      />

      <DeleteAlertDialog
        projectId={projectId}
        alert={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => mutate()}
      />
    </div>
  );
}
