"use client";

import { useEffect } from "react";

import UpgradeNotice from "@/components/common/upgrade-notice";
import GithubConnectionCard from "@/components/github/github-connection-card";
import { SettingsSectionHeader } from "@/components/settings/settings-section";
import SlackChannelProjects from "@/components/slack/slack-channel-projects";
import SlackConnectionCard from "@/components/slack/slack-connection-card";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { Feature } from "@/lib/features/features";
import { track } from "@/lib/posthog";
import { type WorkspaceRole } from "@/lib/workspaces/types";

interface WorkspaceIntegrationsProps {
  workspaceId: string;
  projectId: string;
  currentUserRole: WorkspaceRole;
  slackUpgradeRequired: boolean;
  slackClientId?: string;
  slackRedirectUri?: string;
  slackBrokerEnabled?: boolean;
}

export default function WorkspaceIntegrations({
  workspaceId,
  projectId,
  currentUserRole,
  slackUpgradeRequired,
  slackClientId,
  slackRedirectUri,
  slackBrokerEnabled,
}: WorkspaceIntegrationsProps) {
  const { settingsHref } = useProjectContext();
  const flags = useFeatureFlags();

  useEffect(() => {
    track("integrations", "page_viewed");
  }, []);

  return (
    <>
      <SettingsSectionHeader title="Integrations" description="Manage your workspace integrations" />
      <div className="flex flex-col gap-8">
        {flags[Feature.GITHUB] && (
          <GithubConnectionCard
            workspaceId={workspaceId}
            projectId={projectId}
            canManage={currentUserRole === "owner" || currentUserRole === "admin"}
            returnTo={settingsHref("integrations")}
          />
        )}
        {slackUpgradeRequired ? (
          <UpgradeNotice
            title="Slack alerts aren't included in the Free plan"
            description="Upgrade to Starter to get Signal events and clusters in Slack."
            source="integrations"
          />
        ) : (
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
        )}
      </div>
    </>
  );
}
