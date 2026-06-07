import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";

import { SlackOauthResponseSchema } from "@/lib/actions/slack/types";
import { decodeSlackToken, encodeSlackToken } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { alertTargets, reportTargets, slackIntegrations } from "@/lib/db/migrations/schema";

const ConnectSlackIntegrationSchema = z.object({
  code: z.string(),
  workspaceId: z.guid(),
});

const DeleteSlackIntegrationSchema = z.union([z.object({ workspaceId: z.guid() }), z.object({ teamId: z.string() })]);

const SendTestNotificationSchema = z.object({
  workspaceId: z.guid(),
  channelId: z.string(),
  eventName: z.string().optional(),
});

export interface SlackIntegration {
  id: string;
  workspaceId: string;
  teamId: string;
  teamName: string | null;
}

export interface SlackChannel {
  id: string;
  name: string;
  isMember: boolean;
}

export async function getSlackIntegration(workspaceId: string): Promise<SlackIntegration | null> {
  const [result] = await db
    .select({
      id: slackIntegrations.id,
      workspaceId: slackIntegrations.workspaceId,
      teamId: slackIntegrations.teamId,
      teamName: slackIntegrations.teamName,
    })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.workspaceId, workspaceId))
    .limit(1);

  return result || null;
}

// Exchanges an OAuth code for a bot token via Slack's oauth.v2.access endpoint
// using HTTP Basic auth with the app credentials. The redirect_uri must match
// the one used in the authorize leg or Slack returns bad_redirect_uri.
export async function exchangeSlackOauthCode(code: string, redirectUri: string, codeVerifier?: string) {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("No client id/secret provided.");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri,
  });
  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body,
  });

  const json = await tokenResponse.json();
  const data = SlackOauthResponseSchema.parse(json);

  if (!data.ok) {
    throw new Error(data.error);
  }

  return data;
}

// Encrypts the bot token and upserts the workspace's Slack integration. Shared
// by the direct-connect (cloud) path and the brokered (self-hosted) path so the
// stored row is identical regardless of how the token was obtained.
async function persistSlackIntegration(input: {
  workspaceId: string;
  teamId: string;
  teamName: string | null;
  token: string;
}) {
  const { workspaceId, teamId, teamName, token } = input;
  const { value: encryptedToken, nonce } = await encodeSlackToken(teamId, token);

  await db
    .insert(slackIntegrations)
    .values({
      workspaceId,
      teamId,
      teamName,
      token: encryptedToken,
      nonceHex: nonce,
    })
    .onConflictDoUpdate({
      target: slackIntegrations.workspaceId,
      set: {
        teamId,
        teamName,
        token: encryptedToken,
        nonceHex: nonce,
      },
    });
}

export async function connectSlackIntegration(input: z.infer<typeof ConnectSlackIntegrationSchema>) {
  const { code, workspaceId } = ConnectSlackIntegrationSchema.parse(input);

  const redirectUri = process.env.SLACK_REDIRECT_URL;
  if (!redirectUri) {
    throw new Error("No redirect uri set.");
  }

  const data = await exchangeSlackOauthCode(code, redirectUri);

  await persistSlackIntegration({
    workspaceId,
    teamId: data.team.id,
    teamName: data.team.name || null,
    token: data.access_token,
  });
}

const BrokerRedeemResponseSchema = z.object({
  token: z.string(),
  teamId: z.string(),
  teamName: z.string().nullable(),
  workspaceId: z.guid(),
});

// Brokered (self-hosted) connect: redeem the one-time claim from the broker for
// the bot token, server-to-server, authenticated by this instance's issued key,
// then persist exactly as the direct path does. The token transits over TLS
// only — it never appears in a browser URL. Inert unless SLACK_BROKER_URL and
// SLACK_BROKER_INSTANCE_KEY are configured.
export async function redeemBrokeredSlackToken(input: { claim: string; workspaceId: string }) {
  const brokerUrl = process.env.SLACK_BROKER_URL;
  const instanceKey = process.env.SLACK_BROKER_INSTANCE_KEY;
  if (!brokerUrl || !instanceKey) {
    throw new Error("Slack broker is not configured (SLACK_BROKER_URL / SLACK_BROKER_INSTANCE_KEY).");
  }

  const response = await fetch(`${brokerUrl.replace(/\/+$/, "")}/api/broker/slack/redeem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${instanceKey}`,
    },
    body: JSON.stringify({ claim: input.claim }),
  });

  if (!response.ok) {
    throw new Error(`Broker redeem failed with status ${response.status}`);
  }

  const { token, teamId, teamName, workspaceId } = BrokerRedeemResponseSchema.parse(await response.json());

  // The claim is bound at /cb to the workspace the flow was started for. The
  // caller's URL workspaceId is attacker-controllable (it rides the public
  // callback as a query param), so reject any claim whose bound workspace
  // doesn't match — otherwise a member of workspace B could redeem a claim
  // minted for workspace A by rewriting the workspaceId in the callback URL.
  if (workspaceId !== input.workspaceId) {
    throw new Error("Broker claim workspace mismatch.");
  }

  await persistSlackIntegration({
    workspaceId,
    teamId,
    teamName,
    token,
  });
}

export async function deleteSlackIntegration(
  input: z.infer<typeof DeleteSlackIntegrationSchema>
): Promise<{ success: boolean }> {
  const parsed = DeleteSlackIntegrationSchema.parse(input);

  const condition =
    "workspaceId" in parsed
      ? eq(slackIntegrations.workspaceId, parsed.workspaceId)
      : eq(slackIntegrations.teamId, parsed.teamId);

  const [integration] = await db.select({ id: slackIntegrations.id }).from(slackIntegrations).where(condition).limit(1);

  if (!integration) {
    return { success: true };
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(alertTargets)
      .where(and(eq(alertTargets.integrationId, integration.id), isNotNull(alertTargets.integrationId)));

    await tx
      .delete(reportTargets)
      .where(and(eq(reportTargets.integrationId, integration.id), isNotNull(reportTargets.integrationId)));

    await tx.delete(slackIntegrations).where(eq(slackIntegrations.id, integration.id));
  });

  return { success: true };
}

async function getIntegrationWithToken(workspaceId: string) {
  const [integration] = await db
    .select({
      id: slackIntegrations.id,
      teamId: slackIntegrations.teamId,
      token: slackIntegrations.token,
      nonceHex: slackIntegrations.nonceHex,
    })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.workspaceId, workspaceId))
    .limit(1);

  if (!integration) {
    throw new Error("Slack integration not found for this workspace");
  }

  const token = await decodeSlackToken(integration.teamId, integration.nonceHex, integration.token);
  return { ...integration, decryptedToken: token };
}

const SLACK_CONVERSATIONS_PAGE_LIMIT = 500;

interface SlackConversationsListResponse {
  ok: boolean;
  error?: string;
  channels?: { id: string; name: string; is_member?: boolean }[];
  response_metadata?: { next_cursor?: string };
}

function buildConversationsUrl(cursor: string): string {
  const url = new URL("https://slack.com/api/conversations.list");
  url.searchParams.set("exclude_archived", "true");
  url.searchParams.set("types", "public_channel,private_channel");
  url.searchParams.set("limit", String(SLACK_CONVERSATIONS_PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);
  return url.toString();
}

export interface GetSlackChannelsResult {
  channels: SlackChannel[];
  // True when Slack rate-limited us mid-pagination and the list is incomplete.
  rateLimited: boolean;
}

export async function getSlackChannels(workspaceId: string): Promise<GetSlackChannelsResult> {
  const integration = await getIntegrationWithToken(workspaceId);

  const channels: SlackChannel[] = [];
  let cursor = "";

  do {
    const response = await fetch(buildConversationsUrl(cursor), {
      headers: { Authorization: `Bearer ${integration.decryptedToken}` },
    });

    if (response.status === 429) {
      return { channels, rateLimited: true };
    }

    const data = (await response.json()) as SlackConversationsListResponse;
    if (data.error === "ratelimited") {
      return { channels, rateLimited: true };
    }
    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    for (const ch of data.channels ?? []) {
      channels.push({ id: ch.id, name: ch.name, isMember: !!ch.is_member });
    }

    cursor = data.response_metadata?.next_cursor ?? "";
  } while (cursor);

  return { channels, rateLimited: false };
}

export async function sendTestSlackNotification(input: z.infer<typeof SendTestNotificationSchema>) {
  const { workspaceId, channelId, eventName } = SendTestNotificationSchema.parse(input);

  const integration = await getIntegrationWithToken(workspaceId);

  const displayEventName = eventName || "test_event";

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Event*: \`${displayEventName}\``,
      },
    },
    {
      type: "markdown",
      text: "*sample_key*:\nThis is a test notification from Laminar. Your alert is configured correctly.",
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "View Trace",
            emoji: true,
          },
          url: "https://laminar.sh",
          action_id: "view_trace",
        },
      ],
    },
  ];

  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${integration.decryptedToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      blocks,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    if (data.error === "not_in_channel") {
      throw new Error(
        "The Laminar bot is not in this channel. For private channels, please invite the bot by typing /invite @Laminar in the channel, then try again."
      );
    }
    throw new Error(`Failed to send test notification: ${data.error}`);
  }

  return { success: true };
}
