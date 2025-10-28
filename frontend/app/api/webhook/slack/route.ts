import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { SlackWebhookRequestSchema } from "@/lib/actions/slack/types";
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
      console.error("Missing Slack signature headers");
      return NextResponse.json({ error: "Missing required headers" }, { status: 400 });
    }

    if (!verifySlackRequest({ body, timestamp, signature })) {
      console.error("Slack webhook signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const json = JSON.parse(body);
    const data = SlackWebhookRequestSchema.parse(json);

    if (data.type === "url_verification") {
      return NextResponse.json({ challenge: data.challenge });
    }

    if (data.type === "event_callback") {
      const { event, team_id } = data;

      processSlackEvent({ event, teamId: team_id });

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
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
