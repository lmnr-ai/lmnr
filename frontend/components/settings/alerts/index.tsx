"use client";

import SlackConnectionCard from "@/components/slack/slack-connection-card";
import { useUserContext } from "@/contexts/user-context";

import { SettingsSection, SettingsSectionHeader } from "../settings-section";
import AlertsManager from "./alerts-manager";

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

      <AlertsManager projectId={projectId} workspaceId={workspaceId} userEmail={userEmail} />
    </SettingsSection>
  );
}
