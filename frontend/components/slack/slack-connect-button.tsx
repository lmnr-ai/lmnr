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
  // broker-start route instead of building a direct Slack authorize URL. Broker
  // mode takes precedence: a deployment that has configured the broker can't run
  // the direct flow (no usable Slack app of its own), and leftover
  // SLACK_CLIENT_ID/SLACK_REDIRECT_URL env vars must not divert it there. On
  // Laminar Cloud the broker vars are never set, so the direct flow still wins.
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
    if (brokerEnabled) {
      const sp = new URLSearchParams({ workspaceId });
      if (returnPath) {
        sp.set("returnPath", returnPath);
      }
      return `/api/integrations/slack/broker-start?${sp}`;
    }

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

    return undefined;
  }, [workspaceId, slackClientId, slackRedirectUri, returnPath, brokerEnabled]);

  if (!slackURL) return null;

  return (
    <a href={slackURL} onClick={() => track("integrations", "slack_connect_clicked")}>
      <Button variant="outlinePrimary">Connect to Slack</Button>
    </a>
  );
}
