import { type NextRequest, NextResponse } from "next/server";

import { disconnectGithub, getGithubIntegrationInfo } from "@/lib/actions/github";
import { AuthorizationError } from "@/lib/errors";

export async function GET(_request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  try {
    return NextResponse.json(await getGithubIntegrationInfo(workspaceId));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load GitHub integration" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  try {
    await disconnectGithub(workspaceId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to disconnect GitHub. Please try again." }, { status: 500 });
  }
}
