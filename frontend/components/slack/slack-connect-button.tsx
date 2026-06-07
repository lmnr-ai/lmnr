"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { SLACK_SCOPES } from "@/lib/actions/slack/types";
import { track } from "@/lib/posthog";

interface SlackConnectButtonProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  returnPath?: string;
  // When true (self-hosted brokered mode), the button links to this instance's
  // broker-start route instead of building a direct Slack authorize URL. Cloud
  // mode (slackClientId/slackRedirectUri) takes precedence when both are set.
  brokerEnabled?: boolean;
}

export default function SlackConnectButton({
  workspaceId,
  slackClientId,
  slackRedirectUri,
  returnPath,
  brokerEnabled,
}: SlackConnectButtonProps) {
  const slackURL = useMemo(() => {
    if (slackClientId && slackRedirectUri) {
      const state = returnPath ? `${workspaceId}:${returnPath}` : workspaceId;
      const sp = new URLSearchParams({
        scope: SLACK_SCOPES.join(","),
        client_id: slackClientId,
        state,
        redirect_uri: slackRedirectUri,
      });
      return `https://slack.com/oauth/v2/authorize?${sp}`;
    }

    if (brokerEnabled) {
      const sp = new URLSearchParams({ workspaceId });
      if (returnPath) {
        sp.set("returnPath", returnPath);
      }
      return `/api/integrations/slack/broker-start?${sp}`;
    }

    return undefined;
  }, [workspaceId, slackClientId, slackRedirectUri, returnPath, brokerEnabled]);

  if (!slackURL) return null;

  return (
    <a href={slackURL} onClick={() => track("integrations", "slack_connect_clicked")}>
      <Button variant="outlinePrimary">Connect to Slack</Button>
    </a>
  );
}
