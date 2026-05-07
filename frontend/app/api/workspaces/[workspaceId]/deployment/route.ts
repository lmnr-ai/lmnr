import { getDeployment, updateDeployment } from "@/lib/actions/workspace/deployment";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;

  const result = await getDeployment({ workspaceId });

  return Response.json(result);
});

export const PUT = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;

  const body = await req.json();
  await updateDeployment({ workspaceId, ...body });

  return Response.json({ success: true });
});
