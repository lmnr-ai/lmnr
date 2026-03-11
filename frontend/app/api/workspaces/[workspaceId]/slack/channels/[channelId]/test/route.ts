import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { sendTestSlackNotification } from "@/lib/actions/slack";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ workspaceId: string; channelId: string }> }
) {
  const params = await props.params;
  const { workspaceId, channelId } = params;

  try {
    const body = await request.json();
    const result = await sendTestSlackNotification({
      workspaceId,
      channelId,
      eventName: body.eventName,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send test notification." },
      { status: 500 }
    );
  }
}
