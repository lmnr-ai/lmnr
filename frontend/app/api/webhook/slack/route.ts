import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { handleSlackInteraction } from "@/lib/actions/slack/handle-interaction";
import { SlackBlockActionsSchema, SlackWebhookRequestSchema } from "@/lib/actions/slack/types";
import { processSlackEvent, verifySlackRequest } from "@/lib/actions/slack/webhook";

/**
 * https://api.slack.com/apis/connections/events-api
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.text();
    const timestamp = req.headers.get("x-slack-request-timestamp");
    const signature = req.headers.get("x-slack-signature");

    if (!timestamp || !signature) {
      return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
    }

    if (!verifySlackRequest({ body, timestamp, signature })) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type");

    // Interactive actions (block_actions from the project picker) are sent as form-urlencoded with a
    // `payload` field carrying URL-encoded JSON. Bind the channel, then ACK 200 (the bind is a quick
    // upsert + a response_url post, well within Slack's 3s budget). A handler failure must not 500 the
    // webhook — log and still ACK so Slack stops retrying.
    if (contentType?.includes("application/x-www-form-urlencoded")) {
      const params = new URLSearchParams(body);
      const { payload } = SlackBlockActionsSchema.parse({ payload: params.get("payload") ?? "" });
      try {
        await handleSlackInteraction(payload);
      } catch (error) {
        console.error("Slack interaction handling failed:", error);
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const payload = JSON.parse(body);
    const data = SlackWebhookRequestSchema.parse(payload);

    if ("type" in data) {
      if (data.type === "url_verification") {
        return NextResponse.json({ challenge: data.challenge });
      }

      if (data.type === "event_callback") {
        const { event, team_id } = data;
        await processSlackEvent({ event, teamId: team_id, rawBody: body });
        return NextResponse.json({ ok: true }, { status: 200 });
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
