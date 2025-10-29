import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { processSlashCommand } from "@/lib/actions/slack/slash-commands";
import { SlackSlashCommandSchema, SlackWebhookRequestSchema } from "@/lib/actions/slack/types";
import { processSlackEvent, verifySlackRequest } from "@/lib/actions/slack/webhook";

/**
 * https://api.slack.com/apis/connections/events-api
 * https://api.slack.com/authentication/verifying-requests-from-slack
 * https://api.slack.com/interactivity/slash-commands
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
    const payload = contentType?.includes("application/x-www-form-urlencoded")
      ? Object.fromEntries(new URLSearchParams(body))
      : JSON.parse(body);

    if ("command" in payload && typeof payload.command === "string") {
      const slashCommand = SlackSlashCommandSchema.parse(payload);
      const response = await processSlashCommand(slashCommand);
      return NextResponse.json(response, { status: 200 });
    }

    const data = SlackWebhookRequestSchema.parse(payload);
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
