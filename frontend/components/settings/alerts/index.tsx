"use client";

import UpgradeNotice from "@/components/common/upgrade-notice";
import SlackConnectionCard from "@/components/slack/slack-connection-card";
import { useUserContext } from "@/contexts/user-context";

import { SettingsSection, SettingsSectionHeader } from "../settings-section";
import AlertsManager from "./alerts-manager";
import MetricAlerts from "./metric-alerts";

interface AlertsSettingsProps {
  projectId: string;
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  /** The Free plan has metric alerts by email only: no Slack, no event or cluster alerts. */
  isFree?: boolean;
}

export default function AlertsSettings({
  projectId,
  workspaceId,
  slackClientId,
  slackRedirectUri,
  isFree = false,
}: AlertsSettingsProps) {
  const { email: userEmail } = useUserContext();

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Alerts"
        description="Configure alerts for metrics, new events or clusters. Notifications can be sent to Slack and email."
      />

      {!isFree && (
        <SlackConnectionCard
          workspaceId={workspaceId}
          slackClientId={slackClientId}
          slackRedirectUri={slackRedirectUri}
          returnPath={`/project/${projectId}/settings?tab=alerts`}
        />
      )}

      <MetricAlerts projectId={projectId} workspaceId={workspaceId} userEmail={userEmail} slackAvailable={!isFree} />

      {isFree ? (
        <UpgradeNotice
          title="Event and cluster alerts aren't included in the Free plan"
          description="Upgrade to Pro to get alerts on Signal events and clusters, and to send alerts to Slack."
          source="alerts"
        />
      ) : (
        <AlertsManager projectId={projectId} workspaceId={workspaceId} userEmail={userEmail} />
      )}
    </SettingsSection>
  );
}
