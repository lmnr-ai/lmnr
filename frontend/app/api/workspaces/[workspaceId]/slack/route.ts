import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { deleteSlackIntegration, getSlackIntegration } from "@/lib/actions/slack";

export async function GET(_request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;
  const workspaceId = params.workspaceId;

  try {
    const integration = await getSlackIntegration(workspaceId);
    return NextResponse.json(integration);
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to retrieve Slack integration data. Please try again.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;
  const workspaceId = params.workspaceId;

  try {
    await deleteSlackIntegration({ workspaceId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to remove Slack integration. Please try again.",
      },
      { status: 500 }
    );
  }
}
