import crypto from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { createSlackChannelIntegration, deleteSlackIntegration } from "@/lib/actions/slack/index.ts";
import { SlackEventSchema } from "@/lib/actions/slack/types.ts";
import { db } from "@/lib/db/drizzle";
import { slackIntegrations } from "@/lib/db/migrations/schema";

const VerifySlackRequestSchema = z.object({
  body: z.string(),
  timestamp: z.string(),
  signature: z.string(),
});

/**
 * Verifies that a request came from Slack by validating its signature.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function verifySlackRequest(input: z.infer<typeof VerifySlackRequestSchema>): boolean {
  const { body, timestamp, signature } = VerifySlackRequestSchema.parse(input);

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    throw new Error("SLACK_SIGNING_SECRET is not configured.");
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);

  if (isNaN(requestTime)) {
    throw new Error("Invalid timestamp format");
  }

  if (Math.abs(currentTime - requestTime) > 300) {
    throw new Error("Slack request timestamp is too old");
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = `v0=${crypto.createHmac("sha256", signingSecret).update(sigBasestring, "utf8").digest("hex")}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(mySignature, "utf8"), Buffer.from(signature, "utf8"));
  } catch (error) {
    console.error("Signature comparison failed:", error);
    return false;
  }
}

const ProcessSlackEventSchema = z.object({
  event: SlackEventSchema,
  teamId: z.string(),
});

export async function processSlackEvent(input: z.infer<typeof ProcessSlackEventSchema>): Promise<void> {
  const { event, teamId } = ProcessSlackEventSchema.parse(input);

  switch (event.type) {
    case "app_uninstalled":
      await deleteSlackIntegration({ teamId });
      break;

    case "tokens_revoked":
      console.log(`Tokens revoked for team ${teamId}`);
      await deleteSlackIntegration({ teamId });
      break;

    case "member_joined_channel":
      const integration = await db.query.slackIntegrations.findFirst({
        where: eq(slackIntegrations.teamId, teamId),
        columns: { projectId: true },
      });

      if (!integration) {
        console.error(`No integration found for team ${teamId} to create channel integration`);
        break;
      }

      await createSlackChannelIntegration({
        projectId: integration.projectId,
        teamId,
        channelId: event.channel,
      });
      break;

    case "member_left_channel":
      await deleteSlackIntegration({
        teamId,
        channelId: event.channel,
      });
      break;

    default:
      console.log(`Unhandled Slack event type: ${event}`);
  }
}
