import { getSignalClusters } from "@/lib/actions/signal-clusters";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (_req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;
  return Response.json(await getSignalClusters({ projectId, signalId }));
});
