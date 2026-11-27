import { getUnreadClusterCounts } from "@/lib/actions/signal-clusters";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getUnreadClusterCounts({ projectId }));
});
