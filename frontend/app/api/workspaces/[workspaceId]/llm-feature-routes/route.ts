import { listWorkspaceFeatureRoutes, setWorkspaceFeatureRoute } from "@/lib/actions/llm-feature-routes";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

type Params = { workspaceId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json(await listWorkspaceFeatureRoutes({ workspaceId }));
});

export const PUT = handlerWithAudit<Params>(
  { resource: "workspace", action: "update", noTarget: true },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    const { groupId, target } = await setWorkspaceFeatureRoute({ ...body, workspaceId });
    audit.set({
      metadata: { llmFeatureGroup: groupId, llmProfileId: target?.llmProfileId ?? null, model: target?.model ?? null },
    });
    return Response.json({ success: true });
  }
);
