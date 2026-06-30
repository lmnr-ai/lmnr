import crypto from "crypto";
import { z } from "zod/v4";

import { addEyesReaction, deleteSlackIntegration } from "@/lib/actions/slack/index.ts";
import { SlackEventSchema } from "@/lib/actions/slack/types.ts";

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

// Pull channel + ts off an app_mention event for the :eyes: ack — the union narrowing on the loose
// event schema widens extra props to `{}`, so re-parse the fields we need.
const AppMentionAckSchema = z.object({
  channel: z.string().optional(),
  ts: z.string().optional(),
});

const ProcessSlackEventSchema = z.object({
  event: SlackEventSchema,
  teamId: z.string(),
  // The exact raw request body (already signature-verified). Forwarded byte-for-byte to app-server
  // for `app_mention`; never re-stringified from the parsed event.
  rawBody: z.string(),
});

export async function processSlackEvent(input: z.infer<typeof ProcessSlackEventSchema>): Promise<void> {
  const { event, teamId, rawBody } = ProcessSlackEventSchema.parse(input);

  switch (event.type) {
    case "app_uninstalled":
      await deleteSlackIntegration({ teamId });
      break;

    case "tokens_revoked":
      await deleteSlackIntegration({ teamId });
      break;

    case "app_mention": {
      // React with :eyes: immediately (before the slow agent run) so the user sees an ack.
      // addEyesReaction is best-effort and never throws.
      const { channel, ts } = AppMentionAckSchema.parse(event);
      if (channel && ts) {
        await addEyesReaction({ teamId, channel, ts });
      }
      await forwardSlackEventToBackend(rawBody);
      break;
    }

    default:
      console.log(`Unhandled Slack event type: ${event.type}`);
  }
}

/**
 * Forward a signature-verified Slack event to app-server's internal `/api/v1/slack/process`. Body is
 * the RAW verified bytes (never re-encoded). No auth header — app-server is cluster-internal.
 */
async function forwardSlackEventToBackend(rawBody: string): Promise<void> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1/slack/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Forwarding Slack event to app-server failed: ${res.status}`);
  }
}
