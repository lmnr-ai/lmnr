import crypto from "crypto";

import { after } from "next/server";
import { z } from "zod/v4";

import { addEyesReaction, deleteSlackIntegration } from "@/lib/actions/slack/index.ts";
import { SlackEventSchema } from "@/lib/actions/slack/types.ts";
import { handleSlackMention } from "@/lib/agent";
import { cache } from "@/lib/cache";
import { isEeEnabled } from "@/lib/license";

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

// The union narrowing on the loose event schema widens extra props to `{}`, so re-parse the fields we need.
const AppMentionSchema = z.object({
  channel: z.string().optional(),
  ts: z.string().optional(),
  // Set when the mention is inside a thread; a top-level mention's own ts is the thread root.
  thread_ts: z.string().optional(),
  text: z.string().default(""),
  bot_id: z.string().optional(),
});

const ProcessSlackEventSchema = z.object({
  event: SlackEventSchema,
  eventId: z.string(),
  teamId: z.string(),
  appId: z.string(),
});

// Slack redelivers an event it saw no timely 2xx for; the picker and the nudge are not idempotent, so claim the
// event id first. Claimed on receipt, so a redelivery never reruns a turn that failed (it posts its own error reply).
const SLACK_EVENT_DEDUP_TTL_SECONDS = 600;

const claimSlackEvent = async (eventId: string): Promise<boolean> => {
  try {
    return await cache.setIfAbsent(`slack_event:${eventId}`, true, SLACK_EVENT_DEDUP_TTL_SECONDS);
  } catch (error) {
    // A duplicate reply beats dropping a real mention.
    console.warn("Slack event dedup failed, processing anyway:", error);
    return true;
  }
};

export async function processSlackEvent(input: z.infer<typeof ProcessSlackEventSchema>): Promise<void> {
  const { event, eventId, teamId, appId } = ProcessSlackEventSchema.parse(input);

  switch (event.type) {
    case "app_uninstalled":
      await deleteSlackIntegration({ teamId });
      break;

    case "tokens_revoked":
      await deleteSlackIntegration({ teamId });
      break;

    case "app_mention": {
      const { channel, ts, thread_ts, text, bot_id } = AppMentionSchema.parse(event);
      if (!channel || !ts || bot_id || !(await claimSlackEvent(eventId))) break;
      // ACK and ignore: a non-2xx would only make Slack redeliver the mention.
      if (!(await isEeEnabled())) {
        console.log("Slack app_mention ignored: enterprise features are disabled (no license)");
        break;
      }
      // React with :eyes: immediately (before the slow agent run) so the user sees an ack.
      // addEyesReaction is best-effort and never throws.
      await addEyesReaction({ teamId, channel, ts });
      // Slack wants a 2xx within 3s; the run continues in this process after the response.
      after(() =>
        handleSlackMention({ teamId, appId, channelId: channel, threadTs: thread_ts ?? ts, ts, text }).catch((error) =>
          console.error("Slack mention handling failed:", error)
        )
      );
      break;
    }

    default:
      console.log(`Unhandled Slack event type: ${event.type}`);
  }
}
