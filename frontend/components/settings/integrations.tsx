"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader } from "./settings-section";

interface SlackIntegration {
  id: string;
  teamName: string | null;
  createdAt: string;
}

export default function Integrations({
  slackClientId,
  slackRedirectUri,
}: {
  slackClientId?: string;
  slackRedirectUri?: string;
}) {
  const { projectId } = useParams();
  const searchParams = useSearchParams();

  const { data: slackIntegration, isLoading: isFetchingSlack } = useSWR<SlackIntegration | null>(
    `/api/projects/${projectId}/slack`,
    swrFetcher
  );

  const slackURL = useMemo(() => {
    if (!slackClientId || !slackRedirectUri) {
      return;
    }
    const scope = ["chat:write", "channels:read", "groups:read", "commands", "mpim:read"].join(",");

    const sp = new URLSearchParams({
      scope,
      client_id: slackClientId,
      state: projectId as string,
      redirect_uri: slackRedirectUri,
    });
    return `https://slack.com/oauth/v2/authorize?${sp}`;
  }, [projectId, slackClientId, slackRedirectUri]);

  const renderSlackStatus = useCallback(() => {
    if (isFetchingSlack) {
      return <Skeleton className="h-8 w-32" />;
    }

    if (slackIntegration) {
      return (
        <Badge className="py-1.5 border-success bg-success/80" variant="outline">
          Connected
        </Badge>
      );
    }

    if (slackURL) {
      return (
        <a href={slackURL}>
          <Button variant="outlinePrimary">Connect</Button>
        </a>
      );
    }

    return null;
  }, [isFetchingSlack, slackIntegration, slackURL]);

  return (
    <>
      <SettingsSectionHeader title="Integrations" description="Manage your project integrations" />
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

