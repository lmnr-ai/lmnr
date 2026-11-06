import { getDeployment, updateDeployment } from "@/lib/actions/workspace/deployment";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;

  const result = await getDeployment({ workspaceId });

  return Response.json(result);
});

export const PUT = handlerWithAudit<{ workspaceId: string }>(
  { resource: "deployment", action: "update", noTarget: true },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;

    const body = await req.json();
    await updateDeployment({ workspaceId, ...body });

    return Response.json({ success: true });
  }
);
