import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { SlackOauthResponseSchema } from "@/lib/actions/slack/types";
import { encodeSlackToken } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { slackIntegrations } from "@/lib/db/migrations/schema";

const ConnectSlackIntegrationSchema = z.object({
  code: z.string(),
  projectId: z.string(),
});

const DeleteSlackIntegrationSchema = z.object({
  teamId: z.string(),
  channelId: z.string().optional(),
});

const CreateSlackChannelIntegrationSchema = z.object({
  projectId: z.string(),
  teamId: z.string(),
  channelId: z.string(),
});

export interface SlackIntegration {
  id: string;
  projectId: string;
  teamId: string;
  channelId: string;
  teamName: string | null;
  createdAt: string;
}

export async function getSlackIntegration(projectId: string): Promise<SlackIntegration | null> {
  const integration = await db.query.slackIntegrations.findFirst({
    where: eq(slackIntegrations.projectId, projectId),
    columns: {
      id: true,
      projectId: true,
      teamId: true,
      channelId: true,
      teamName: true,
      createdAt: true,
    },
  });

  return integration ?? null;
}

export async function connectSlackIntegration(
  input: z.infer<typeof ConnectSlackIntegrationSchema>
): Promise<{ success: true } | { success: false; error: string }> {
  const { code, projectId } = ConnectSlackIntegrationSchema.parse(input);

  try {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("No client id/secret provided.");
    }
    // TODO: uncomment
    // const redirectUri = `${process.env.NEXT_PUBLIC_URL}/integrations/slack`;
    const redirectUri = `https://8d2649bade41.ngrok-free.app/api/integrations/slack`;
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

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
      return {
        success: false,
        error: data.error || "Failed to obtain Slack access token",
      };
    }

    const { value: encryptedToken, nonce } = await encodeSlackToken(data.team.id, data.access_token);

    await db
      .insert(slackIntegrations)
      .values({
        projectId,
        teamId: data.team.id,
        channelId: data.incoming_webhook.channel_id,
        teamName: data.team.name || null,
        token: encryptedToken,
        nonceHex: nonce,
      })
      .onConflictDoUpdate({
        target: slackIntegrations.projectId,
        set: {
          teamId: data.team.id,
          channelId: data.incoming_webhook.channel_id,
          teamName: data.team.name || null,
          token: encryptedToken,
          nonceHex: nonce,
        },
      });

    return { success: true };
  } catch (error) {
    console.error("Slack OAuth error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

export async function deleteSlackIntegration(
  input: z.infer<typeof DeleteSlackIntegrationSchema>
): Promise<{ success: boolean }> {
  const { teamId, channelId } = DeleteSlackIntegrationSchema.parse(input);

  if (channelId) {
    await db
      .delete(slackIntegrations)
      .where(and(eq(slackIntegrations.teamId, teamId), eq(slackIntegrations.channelId, channelId)));
  } else {
    await db.delete(slackIntegrations).where(eq(slackIntegrations.teamId, teamId));
  }

  return { success: true };
}

export async function createSlackChannelIntegration(
  input: z.infer<typeof CreateSlackChannelIntegrationSchema>
): Promise<{ success: boolean; error?: string }> {
  const { projectId, teamId, channelId } = CreateSlackChannelIntegrationSchema.parse(input);

  try {
    const existingIntegration = await db.query.slackIntegrations.findFirst({
      where: eq(slackIntegrations.teamId, teamId),
      columns: {
        token: true,
        nonceHex: true,
        teamName: true,
      },
    });

    if (!existingIntegration) {
      return {
        success: false,
        error: "No OAuth token found for this team. Please reconnect the Slack integration.",
      };
    }

    await db
      .insert(slackIntegrations)
      .values({
        projectId,
        teamId,
        channelId,
        teamName: existingIntegration.teamName,
        token: existingIntegration.token,
        nonceHex: existingIntegration.nonceHex,
      })
      .onConflictDoNothing();

    return { success: true };
  } catch (error) {
    console.error("Error creating Slack channel integration:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
