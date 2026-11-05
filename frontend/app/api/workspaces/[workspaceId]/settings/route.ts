import { updateWorkspaceSettings } from "@/lib/actions/workspace/settings";
import { withAudit } from "@/lib/audit";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const PATCH = withAudit<{ workspaceId: string }>(
  { resource: "workspace", action: "update" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;

    // Workspace settings currently only carry cloud-only keys (Privacy Mode);
    // self-hosted deployments have nothing to write here.
    if (!isFeatureEnabled(Feature.LAMINAR_CLOUD)) {
      return Response.json({ error: "Not available on this deployment" }, { status: 404 });
    }

    const body = await req.json();
    await updateWorkspaceSettings({ workspaceId, settings: body?.settings ?? {} });
    audit.set({ metadata: { fields: Object.keys(body?.settings ?? {}) } });
    await audit.target(workspaceId);
    return Response.json({ success: true });
  }
);
