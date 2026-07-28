import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { updateWorkspaceSettings } from "@/lib/actions/workspace/settings";

export async function PATCH(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const body = await request.json();
    const result = await updateWorkspaceSettings({ workspaceId, settings: body?.settings });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update workspace settings." },
      { status: 500 }
    );
  }
}
