import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { verifySlackChannels } from "@/lib/actions/slack";

export async function POST(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;
  const workspaceId = params.workspaceId;

  try {
    const body = await request.json();
    const channels = await verifySlackChannels({
      workspaceId,
      names: body?.names ?? [],
    });
    return NextResponse.json(channels);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to verify Slack channels." },
      { status: 500 }
    );
  }
}
