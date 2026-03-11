import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { SlackOauthResponseSchema } from "@/lib/actions/slack/types";
import { decodeSlackToken, encodeSlackToken } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { projects, slackChannelToEvents, slackIntegrations } from "@/lib/db/migrations/schema";

const ConnectSlackIntegrationSchema = z.object({
  code: z.string(),
  workspaceId: z.string(),
});

const DeleteSlackIntegrationSchema = z.object({
  teamId: z.string(),
});

const CreateSlackSubscriptionSchema = z.object({
  integrationId: z.string(),
  channelId: z.string(),
  projectId: z.string(),
  eventName: z.string(),
});

const DeleteSlackSubscriptionSchema = z.object({
  id: z.string(),
});

const SendTestNotificationSchema = z.object({
  workspaceId: z.string(),
  channelId: z.string(),
  eventName: z.string().optional(),
});

export interface SlackIntegration {
  id: string;
  workspaceId: string;
  teamId: string;
  teamName: string | null;
}

export interface SlackSubscription {
  id: string;
  channelId: string;
  projectId: string;
  projectName: string;
  eventName: string;
  createdAt: string;
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
  const { teamId } = DeleteSlackIntegrationSchema.parse(input);

  await db.delete(slackIntegrations).where(eq(slackIntegrations.teamId, teamId));

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

export async function getSlackSubscriptions(workspaceId: string): Promise<SlackSubscription[]> {
  const [integration] = await db
    .select({ id: slackIntegrations.id })
    .from(slackIntegrations)
    .where(eq(slackIntegrations.workspaceId, workspaceId))
    .limit(1);

  if (!integration) {
    return [];
  }

  const results = await db
    .select({
      id: slackChannelToEvents.id,
      channelId: slackChannelToEvents.channelId,
      projectId: slackChannelToEvents.projectId,
      projectName: projects.name,
      eventName: slackChannelToEvents.eventName,
      createdAt: slackChannelToEvents.createdAt,
    })
    .from(slackChannelToEvents)
    .innerJoin(projects, eq(slackChannelToEvents.projectId, projects.id))
    .where(eq(slackChannelToEvents.integrationId, integration.id));

  return results;
}

export async function createSlackSubscription(input: z.infer<typeof CreateSlackSubscriptionSchema>) {
  const { integrationId, channelId, projectId, eventName } = CreateSlackSubscriptionSchema.parse(input);

  const [result] = await db
    .insert(slackChannelToEvents)
    .values({ integrationId, channelId, projectId, eventName })
    .onConflictDoNothing({
      target: [slackChannelToEvents.channelId, slackChannelToEvents.projectId, slackChannelToEvents.eventName],
    })
    .returning();

  if (!result) {
    throw new Error("Subscription already exists for this channel, project, and event combination");
  }

  return result;
}

export async function deleteSlackSubscription(input: z.infer<typeof DeleteSlackSubscriptionSchema>) {
  const { id } = DeleteSlackSubscriptionSchema.parse(input);

  await db.delete(slackChannelToEvents).where(eq(slackChannelToEvents.id, id));

  return { success: true };
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
