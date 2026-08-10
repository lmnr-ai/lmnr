import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { updateWorkspaceSettings } from "@/lib/actions/workspace/settings";
import { AuthorizationError } from "@/lib/errors";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export async function PATCH(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const { workspaceId } = await props.params;

  // Workspace settings currently only carry cloud-only keys (Privacy Mode);
  // self-hosted deployments have nothing to write here.
  if (!isFeatureEnabled(Feature.LAMINAR_CLOUD)) {
    return Response.json({ error: "Not available on this deployment" }, { status: 404 });
  }

  try {
    const body = await req.json();

    await updateWorkspaceSettings({ workspaceId, settings: body?.settings ?? {} });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    if (error instanceof AuthorizationError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to update workspace settings." },
      { status: 500 }
    );
  }
}
