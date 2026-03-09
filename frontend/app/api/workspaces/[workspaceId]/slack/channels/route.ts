import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSlackChannels } from "@/lib/actions/slack";

export async function GET(_request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;
  const workspaceId = params.workspaceId;

  try {
    const channels = await getSlackChannels(workspaceId);
    return NextResponse.json(channels);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Slack channels." },
      { status: 500 }
    );
  }
}
