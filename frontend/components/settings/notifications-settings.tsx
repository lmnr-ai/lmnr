"use client";

import Link from "next/link";
import useSWR from "swr";

import NotificationsList from "@/components/notifications/notifications-list";
import { SettingsSectionHeader } from "@/components/settings/settings-section";
import SlackConnectButton from "@/components/slack/slack-connect-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/utils";

interface SlackIntegrationInfo {
  id: string;
  teamName: string | null;
}

interface NotificationsSettingsProps {
  projectId: string;
  workspaceId: string;
  isFreeTier: boolean;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function NotificationsSettings({
  projectId,
  workspaceId,
  isFreeTier,
  slackClientId,
  slackRedirectUri,
}: NotificationsSettingsProps) {
  const { data: slackIntegration, isLoading } = useSWR<SlackIntegrationInfo | null>(
    `/api/workspaces/${workspaceId}/slack`,
    swrFetcher
  );

  if (isFreeTier) {
    return (
      <>
        <SettingsSectionHeader title="Notifications" description="Configure Slack notifications for your project." />
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <h2 className="text-lg font-semibold">Notifications are available on paid plans</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Upgrade your workspace to configure Slack notifications for your project signals.
          </p>
          <Link href={`/workspace/${workspaceId}?tab=billing`}>
            <Button>Upgrade plan</Button>
          </Link>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <SettingsSectionHeader title="Notifications" description="Configure Slack notifications for your project." />
        <Skeleton className="h-32 w-full" />
      </>
    );
  }

  if (!slackIntegration) {
    return (
      <>
        <SettingsSectionHeader title="Notifications" description="Configure Slack notifications for your project." />
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <h2 className="text-lg font-semibold">Connect Slack to get started</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Connect your workspace to Slack to receive notifications when signal events are triggered.
          </p>
          <SlackConnectButton
            workspaceId={workspaceId}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <SettingsSectionHeader title="Notifications" description="Configure Slack notifications for your project." />
      <NotificationsList projectId={projectId} workspaceId={workspaceId} integrationId={slackIntegration.id} />
    </>
  );
}
