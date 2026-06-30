"use client";

import { useEffect } from "react";

import { SettingsSectionHeader } from "@/components/settings/settings-section";
import SlackChannelProjects from "@/components/slack/slack-channel-projects";
import SlackConnectionCard from "@/components/slack/slack-connection-card";
import { useProjectContext } from "@/contexts/project-context";
import { track } from "@/lib/posthog";

interface WorkspaceIntegrationsProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  slackBrokerEnabled?: boolean;
}

export default function WorkspaceIntegrations({
  workspaceId,
  slackClientId,
  slackRedirectUri,
  slackBrokerEnabled,
}: WorkspaceIntegrationsProps) {
  const { settingsHref } = useProjectContext();

  useEffect(() => {
    track("integrations", "page_viewed");
  }, []);

  return (
    <>
      <SettingsSectionHeader title="Integrations" description="Manage your workspace integrations" />
      <div className="flex flex-col gap-8">
        <SlackConnectionCard
          workspaceId={workspaceId}
          slackClientId={slackClientId}
          slackRedirectUri={slackRedirectUri}
          brokerEnabled={slackBrokerEnabled}
          returnPath={settingsHref("integrations")}
          hideSettingsLink
        >
          <SlackChannelProjects workspaceId={workspaceId} className="rounded-none border-0 bg-transparent" />
        </SlackConnectionCard>
      </div>
    </>
  );
}
