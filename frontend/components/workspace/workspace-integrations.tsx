"use client";

import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import useSWR from "swr";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import SlackConnectButton from "@/components/slack/slack-connect-button";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { swrFetcher } from "@/lib/utils";

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

export default function WorkspaceIntegrations({
  workspaceId,
  slackClientId,
  slackRedirectUri,
}: WorkspaceIntegrationsProps) {
  const searchParams = useSearchParams();

  const { data: slackIntegration, isLoading: isFetchingSlack } = useSWR<SlackIntegration | null>(
    `/api/workspaces/${workspaceId}/slack`,
    swrFetcher
  );

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
      </div>
    </>
  );
}
