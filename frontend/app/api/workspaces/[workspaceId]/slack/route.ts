import { deleteSlackIntegration, getSlackIntegration } from "@/lib/actions/slack";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_request, ctx) => {
  const { workspaceId } = await ctx.params;

  const integration = await getSlackIntegration(workspaceId);
  return Response.json(integration);
});

export const DELETE = apiHandler<{ workspaceId: string }>(async (_request, ctx) => {
  const { workspaceId } = await ctx.params;

  await deleteSlackIntegration({ workspaceId });
  return Response.json({ success: true });
});
