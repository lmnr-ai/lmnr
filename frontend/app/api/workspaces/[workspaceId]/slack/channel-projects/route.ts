import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import {
  deleteChannelProjectBinding,
  getChannelProjectBindings,
  upsertChannelProjectBinding,
} from "@/lib/actions/slack/channel-projects";

// Auth: proxy.ts gates /api/workspaces/:workspaceId/* via isUserMemberOfWorkspace, so a non-member
// never reaches these handlers — no in-handler authz needed.

export async function GET(_req: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  try {
    const bindings = await getChannelProjectBindings(workspaceId);
    return NextResponse.json(bindings);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load channel bindings." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  const body = await req.json();
  try {
    await upsertChannelProjectBinding({
      workspaceId,
      channelId: body.channelId,
      channelName: body.channelName,
      projectId: body.projectId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save channel binding." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  const channelId = req.nextUrl.searchParams.get("channelId");
  try {
    if (!channelId) {
      return NextResponse.json({ error: "channelId query param is required" }, { status: 400 });
    }
    await deleteChannelProjectBinding({ workspaceId, channelId });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove channel binding." },
      { status: 500 }
    );
  }
}
