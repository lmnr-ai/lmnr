import { eq } from "drizzle-orm";
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
});

export interface SlackIntegration {
  id: string;
  projectId: string;
  teamId: string;
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
      teamName: true,
      createdAt: true,
    },
  });

  return integration ?? null;
}

export async function connectSlackIntegration(input: z.infer<typeof ConnectSlackIntegrationSchema>) {
  const { code, projectId } = ConnectSlackIntegrationSchema.parse(input);
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("No client id/secret provided.");
  }
  const redirectUri = `${process.env.NEXT_PUBLIC_URL}/api/integrations/slack`;
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
    throw new Error(data.error);
  }

  const { value: encryptedToken, nonce } = await encodeSlackToken(data.team.id, data.access_token);

  await db
    .insert(slackIntegrations)
    .values({
      projectId,
      teamId: data.team.id,
      teamName: data.team.name || null,
      token: encryptedToken,
      nonceHex: nonce,
    })
    .onConflictDoUpdate({
      target: slackIntegrations.projectId,
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
