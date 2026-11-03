"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
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

// Build the Slack OAuth entry URL (broker-start route for self-hosted, or the direct
// start route on Cloud). Re-running it upserts the bot token in
// place, so it doubles as the "Reconnect" target for an already-connected workspace.
// Returns undefined when neither broker nor client creds are configured.
export function buildSlackConnectUrl({
  workspaceId,
  slackClientId,
  slackRedirectUri,
  returnPath,
  brokerEnabled,
}: SlackConnectButtonProps): string | undefined {
  if (brokerEnabled) {
    const sp = new URLSearchParams({ workspaceId });
    if (returnPath) {
      sp.set("returnPath", returnPath);
    }
    return `/api/integrations/slack/broker-start?${sp}`;
  }

  // The client id / redirect uri only signal that the direct flow is configured; the
  // start route builds the authorize URL with a server-minted state + PKCE.
  if (slackClientId && slackRedirectUri) {
    const sp = new URLSearchParams({ workspaceId });
    if (returnPath) {
      sp.set("returnPath", returnPath);
    }
    return `/api/integrations/slack/start?${sp}`;
  }

  return undefined;
}

export default function SlackConnectButton({
  workspaceId,
  slackClientId,
  slackRedirectUri,
  returnPath,
  brokerEnabled,
}: SlackConnectButtonProps) {
  const slackURL = useMemo(
    () => buildSlackConnectUrl({ workspaceId, slackClientId, slackRedirectUri, returnPath, brokerEnabled }),
    [workspaceId, slackClientId, slackRedirectUri, returnPath, brokerEnabled]
  );

  if (!slackURL) return null;

  return (
    <a href={slackURL} onClick={() => track("integrations", "slack_connect_clicked")}>
      <Button variant="outlinePrimary">Connect to Slack</Button>
    </a>
  );
}
