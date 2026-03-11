"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";

import slackLogo from "@/assets/logo/slack.png";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/utils";

import SlackConnectButton from "./slack-connect-button";

export interface SlackIntegrationInfo {
  id: string;
  teamName: string | null;
  createdAt?: string;
}

interface SlackConnectionCardProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  returnPath?: string;
  disabled?: boolean;
}

export function useSlackIntegration(workspaceId: string, enabled = true) {
  return useSWR<SlackIntegrationInfo | null>(enabled ? `/api/workspaces/${workspaceId}/slack` : null, swrFetcher);
}

export default function SlackConnectionCard({
  workspaceId,
  slackClientId,
  slackRedirectUri,
  returnPath,
  disabled,
}: SlackConnectionCardProps) {
  const searchParams = useSearchParams();
  const { data: slackIntegration, isLoading } = useSlackIntegration(workspaceId, !disabled);

  if (disabled) return null;

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      </div>
    );
  }

  const slackError = searchParams.get("slack") === "error";

  return (
    <div className="rounded-lg border border-border p-4 flex items-center gap-4">
      <Image src={slackLogo} alt="Slack" width={32} height={32} className="shrink-0" unoptimized />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">Slack</p>
        <p className="text-xs text-muted-foreground">
          {slackIntegration
            ? "Receive notifications in Slack. Works across all projects."
            : "Connect your workspace to Slack to receive notifications."}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        {slackIntegration ? (
          <Badge className="py-1.5 border-success bg-success/80" variant="outline">
            Connected ({slackIntegration?.teamName ?? "-"})
          </Badge>
        ) : (
          <SlackConnectButton
            workspaceId={workspaceId}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
            returnPath={returnPath}
          />
        )}
        {slackError && <span className="text-destructive text-xs">Failed to connect. Please try again.</span>}
      </div>
    </div>
  );
}
