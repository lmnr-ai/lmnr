"use client";

import { isEmpty } from "lodash";
import { Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import SlackConnectionCard, { useSlackIntegration } from "@/components/slack/slack-connection-card";
import { Button } from "@/components/ui/button";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { type AlertWithDetails } from "@/lib/actions/alerts/types";
import { Feature } from "@/lib/features/features";
import { swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "../settings-section";
import CreateAlertSheet from "./create-alert-sheet";
import DeleteAlertDialog from "./delete-alert-dialog";
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
  const { workspace } = useProjectContext();
  const featureFlags = useFeatureFlags();

  const isFreeTier = featureFlags[Feature.SUBSCRIPTION] && workspace?.tierName?.toLowerCase() === "free";

  const { data: slackIntegration } = useSlackIntegration(workspaceId, !isFreeTier);

  const {
    data: alertsList,
    isLoading: isLoadingAlerts,
    mutate: mutateAlerts,
  } = useSWR<AlertWithDetails[]>(isFreeTier ? null : `/api/projects/${projectId}/alerts`, swrFetcher);

  const [deleteTarget, setDeleteTarget] = useState<AlertWithDetails | null>(null);

  if (isFreeTier) {
    return (
      <SettingsSection>
        <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />
        <div className="rounded-lg border border-border bg-muted/30 p-5 flex items-start gap-4">
          <div className="flex items-center justify-center h-9 w-9 rounded-md bg-muted text-muted-foreground shrink-0">
            <Lock className="h-5 w-5" />
          </div>
          <div className="space-y-3 flex-1">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Upgrade to configure Slack alerts</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Slack notifications are available on paid plans. Upgrade your workspace to start receiving alerts.
              </p>
            </div>
            <Link href={`/workspace/${workspaceId}?tab=billing`}>
              <Button variant="outline" className="bg-secondary">
                View pricing
              </Button>
            </Link>
          </div>
        </div>
      </SettingsSection>
    );
  }

  if (!slackIntegration) {
    return (
      <SettingsSection>
        <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />
        <SlackConnectionCard
          workspaceId={workspaceId}
          slackClientId={slackClientId}
          slackRedirectUri={slackRedirectUri}
          returnPath={`/project/${projectId}/settings?tab=alerts`}
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader title="Alerts" description="Configure Slack alerts for signal events." />

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
        isEmpty={!alertsList && isEmpty(alertsList)}
        emptyMessage="No alerts yet. Click 'Alert' to create one."
        headers={["Name", "Targets", "Created", ""]}
        colSpan={4}
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

      <DeleteAlertDialog
        projectId={projectId}
        alert={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => mutateAlerts()}
      />
    </SettingsSection>
  );
}
