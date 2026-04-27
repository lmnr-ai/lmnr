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

const SendTestNotificationByNamesSchema = z.object({
  workspaceId: z.guid(),
  names: z.array(z.string().min(1)).min(1),
  eventName: z.string().optional(),
});

const VerifySlackChannelsSchema = z.object({
  workspaceId: z.guid(),
  names: z.array(z.string().min(1)).min(1),
});

// Cap how many pages we are willing to walk so a huge workspace can't
// stall a save indefinitely. 50 * 1000 = 50k channels, which is well above
// any realistic Slack workspace.
const MAX_VERIFY_PAGES = 50;
const VERIFY_PAGE_SIZE = 1000;

export interface SlackIntegration {
  id: string;
  workspaceId: string;
  teamId: string;
  teamName: string | null;
}

export interface SlackChannel {
  id: string;
  name: string;
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

export async function connectSlackIntegration(input: z.infer<typeof ConnectSlackIntegrationSchema>) {
  const { code, workspaceId } = ConnectSlackIntegrationSchema.parse(input);
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("No client id/secret provided.");
  }
  const redirectUri = process.env.SLACK_REDIRECT_URL;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  if (!redirectUri) {
    throw new Error("No redirect uri set.");
  }

  const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri,
    }),
  });

  const json = await tokenResponse.json();
  const data = SlackOauthResponseSchema.parse(json);

  if (!data.ok) {
    throw new Error(data.error);
  }

  const { value: encryptedToken, nonce } = await encodeSlackToken(data.team.id, data.access_token);

  await db
    .insert(slackIntegrations)
    .values({
      workspaceId,
      teamId: data.team.id,
      teamName: data.team.name || null,
      token: encryptedToken,
      nonceHex: nonce,
    })
    .onConflictDoUpdate({
      target: slackIntegrations.workspaceId,
      set: {
        teamId: data.team.id,
        teamName: data.team.name || null,
        token: encryptedToken,
        nonceHex: nonce,
      },
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

export async function getSlackChannels(workspaceId: string): Promise<SlackChannel[]> {
  const integration = await getIntegrationWithToken(workspaceId);

  const response = await fetch(
    "https://slack.com/api/conversations.list?exclude_archived=true&types=public_channel,private_channel&limit=200",
    {
      headers: {
        Authorization: `Bearer ${integration.decryptedToken}`,
      },
    }
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return (data.channels || []).map((ch: { id: string; name: string }) => ({
    id: ch.id,
    name: ch.name,
  }));
}

const normalizeChannelName = (name: string) => name.trim().replace(/^#/, "").toLowerCase();

const resolveSlackChannelsByNames = async (token: string, names: string[]): Promise<SlackChannel[]> => {
  const targets = Array.from(new Set(names.map(normalizeChannelName))).filter((n) => n.length > 0);
  if (targets.length === 0) return [];

  // First attempt: resolve by directly looking up each name via `conversations.info` is
  // not supported (Slack requires an id). So we page through `conversations.list` and
  // stop as soon as every requested name is resolved.
  const remaining = new Set(targets);
  const resolved = new Map<string, SlackChannel>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_VERIFY_PAGES && remaining.size > 0; page++) {
    const url = new URL("https://slack.com/api/conversations.list");
    url.searchParams.set("exclude_archived", "true");
    url.searchParams.set("types", "public_channel,private_channel");
    url.searchParams.set("limit", String(VERIFY_PAGE_SIZE));
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Slack API error: ${data.error}`);
    }

    for (const ch of (data.channels ?? []) as { id: string; name: string }[]) {
      const normalized = normalizeChannelName(ch.name);
      if (remaining.has(normalized)) {
        resolved.set(normalized, { id: ch.id, name: ch.name });
        remaining.delete(normalized);
        if (remaining.size === 0) break;
      }
    }

    cursor = data.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }

  if (remaining.size > 0) {
    const missing = Array.from(remaining).map((n) => `#${n}`);
    throw new Error(
      `Slack channel${missing.length === 1 ? "" : "s"} not found: ${missing.join(", ")}. ` +
        `Make sure the channel exists and that the Laminar app has been added to it.`
    );
  }

  // Preserve the caller's input order.
  return targets.map((n) => resolved.get(n)!).filter(Boolean);
};

export async function verifySlackChannels(input: z.infer<typeof VerifySlackChannelsSchema>): Promise<SlackChannel[]> {
  const { workspaceId, names } = VerifySlackChannelsSchema.parse(input);
  const integration = await getIntegrationWithToken(workspaceId);
  return resolveSlackChannelsByNames(integration.decryptedToken, names);
}

const buildTestBlocks = (eventName?: string) => {
  const displayEventName = eventName || "test_event";
  return [
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
};

const postTestMessage = async (token: string, channelId: string, blocks: unknown[]) => {
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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
  return data as { ok: boolean; error?: string };
};

export async function sendTestSlackNotification(input: z.infer<typeof SendTestNotificationSchema>) {
  const { workspaceId, channelId, eventName } = SendTestNotificationSchema.parse(input);

  const integration = await getIntegrationWithToken(workspaceId);
  const blocks = buildTestBlocks(eventName);

  const data = await postTestMessage(integration.decryptedToken, channelId, blocks);

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

export async function sendTestSlackNotificationByNames(input: z.infer<typeof SendTestNotificationByNamesSchema>) {
  const { workspaceId, names, eventName } = SendTestNotificationByNamesSchema.parse(input);

  const integration = await getIntegrationWithToken(workspaceId);
  const channels = await resolveSlackChannelsByNames(integration.decryptedToken, names);
  const blocks = buildTestBlocks(eventName);

  const failures: Array<{ channel: string; error: string }> = [];
  for (const ch of channels) {
    const data = await postTestMessage(integration.decryptedToken, ch.id, blocks);
    if (!data.ok) {
      const error =
        data.error === "not_in_channel"
          ? "The Laminar bot is not in this channel. Invite it with /invite @Laminar in the channel, then try again."
          : `Failed to send test notification: ${data.error}`;
      failures.push({ channel: `#${ch.name}`, error });
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.map((f) => `${f.channel}: ${f.error}`).join("\n"));
  }

  return { success: true };
}
