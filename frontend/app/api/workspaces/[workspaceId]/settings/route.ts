import { updateWorkspaceSettings } from "@/lib/actions/workspace/settings";
import { apiHandler } from "@/lib/api/api-handler";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const PATCH = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;

  // Workspace settings currently only carry cloud-only keys (Privacy Mode);
  // self-hosted deployments have nothing to write here.
  if (!isFeatureEnabled(Feature.LAMINAR_CLOUD)) {
    return Response.json({ error: "Not available on this deployment" }, { status: 404 });
  }

  const body = await req.json();
  await updateWorkspaceSettings({ workspaceId, settings: body?.settings ?? {} });
  return Response.json({ success: true });
});
