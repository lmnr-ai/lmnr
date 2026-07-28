import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { updateWorkspaceSettings } from "@/lib/actions/workspace/settings";
import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";

export async function PATCH(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  // `proxy.ts` only gates workspace membership, so admins and members reach this
  // handler. The role check is repeated here (the action enforces it too, for
  // server-action callers) so a non-owner gets 403 rather than the action's
  // throw falling through to the catch-all 500 below.
  try {
    await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });
  } catch {
    return NextResponse.json(
      { error: "Forbidden: only the workspace owner can change these settings." },
      {
        status: 403,
      }
    );
  }

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
