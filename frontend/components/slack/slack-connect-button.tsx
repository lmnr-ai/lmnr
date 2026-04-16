"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

const SLACK_SCOPES = ["chat:write", "chat:write.public", "channels:read", "groups:read", "mpim:read"];

interface SlackConnectButtonProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
  returnPath?: string;
}

export default function SlackConnectButton({
  workspaceId,
  slackClientId,
  slackRedirectUri,
  returnPath,
}: SlackConnectButtonProps) {
  const slackURL = useMemo(() => {
    if (!slackClientId || !slackRedirectUri) return;

    const state = returnPath ? `${workspaceId}:${returnPath}` : workspaceId;

    const sp = new URLSearchParams({
      scope: SLACK_SCOPES.join(","),
      client_id: slackClientId,
      state,
      redirect_uri: slackRedirectUri,
    });
    return `https://slack.com/oauth/v2/authorize?${sp}`;
  }, [workspaceId, slackClientId, slackRedirectUri, returnPath]);

  if (!slackURL) return null;

  return (
    <a href={slackURL} onClick={() => track("integrations", "slack_connect_clicked")}>
      <Button variant="outlinePrimary">Connect to Slack</Button>
    </a>
  );
}
