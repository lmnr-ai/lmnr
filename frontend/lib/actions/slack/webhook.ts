import crypto from "crypto";
import { z } from "zod/v4";

import { deleteSlackIntegration } from "@/lib/actions/slack/index.ts";
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

    case "app_mention":
      await forwardSlackEventToBackend(rawBody);
      break;

    default:
      console.log(`Unhandled Slack event type: ${event.type}`);
  }
}

/**
 * Forward a signature-verified Slack event to app-server's internal `/api/v1/slack/process`. Body is
 * the RAW verified bytes (never re-encoded). No auth header — app-server is cluster-internal.
 *
 * Best-effort: failures are logged, never thrown. The channel-agent endpoint is signals-gated, so on
 * OSS / non-signals builds it returns 404 — we must still ack Slack with 200, otherwise Slack treats
 * the 5xx as a delivery failure and retries the same `app_mention` repeatedly.
 */
async function forwardSlackEventToBackend(rawBody: string): Promise<void> {
  try {
    const res = await fetch(`${process.env.BACKEND_URL}/api/v1/slack/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`Forwarding Slack event to app-server failed: ${res.status}`);
    }
  } catch (error) {
    console.error("Forwarding Slack event to app-server failed:", error);
  }
}
