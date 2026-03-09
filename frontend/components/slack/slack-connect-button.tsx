"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";

const SLACK_SCOPES = ["chat:write", "chat:write.public", "channels:read", "groups:read", "commands", "mpim:read"];

interface SlackConnectButtonProps {
  workspaceId: string;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function SlackConnectButton({ workspaceId, slackClientId, slackRedirectUri }: SlackConnectButtonProps) {
  const slackURL = useMemo(() => {
    if (!slackClientId || !slackRedirectUri) return;

    const sp = new URLSearchParams({
      scope: SLACK_SCOPES.join(","),
      client_id: slackClientId,
      state: workspaceId,
      redirect_uri: slackRedirectUri,
    });
    return `https://slack.com/oauth/v2/authorize?${sp}`;
  }, [workspaceId, slackClientId, slackRedirectUri]);

  if (!slackURL) return null;

  return (
    <a href={slackURL}>
      <Button variant="outlinePrimary">Connect to Slack</Button>
    </a>
  );
}
