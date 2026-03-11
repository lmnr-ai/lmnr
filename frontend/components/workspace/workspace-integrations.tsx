"use client";

import { SettingsSectionHeader } from "@/components/settings/settings-section";
import SlackConnectionCard from "@/components/slack/slack-connection-card";

interface WorkspaceIntegrationsProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function WorkspaceIntegrations({
  workspaceId,
  slackClientId,
  slackRedirectUri,
}: WorkspaceIntegrationsProps) {
  return (
    <>
      <SettingsSectionHeader title="Integrations" description="Manage your workspace integrations" />
      <div className="flex flex-col gap-8">
        <SlackConnectionCard
          workspaceId={workspaceId}
          slackClientId={slackClientId}
          slackRedirectUri={slackRedirectUri}
        />
      </div>
    </>
  );
}
