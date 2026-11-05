import { getUsageBreakdown } from "@/lib/actions/usage/usage-breakdown";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json(await getUsageBreakdown({ workspaceId }));
});
