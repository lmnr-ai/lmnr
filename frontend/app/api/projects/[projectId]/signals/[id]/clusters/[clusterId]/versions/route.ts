import { getClusterVersionMarkers } from "@/lib/actions/signal-clusters";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string; clusterId: string }>(async (_req, ctx) => {
  const { projectId, id: signalId, clusterId } = await ctx.params;
  return Response.json(await getClusterVersionMarkers({ projectId, signalId, clusterId }));
});
