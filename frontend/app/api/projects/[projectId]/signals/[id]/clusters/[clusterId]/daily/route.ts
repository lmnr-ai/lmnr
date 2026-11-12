import { getClusterDaily } from "@/lib/actions/signal-clusters";
import { apiHandler } from "@/lib/api/api-handler";

/** Events per day for the cluster's chart over `?pastHours=` or `?startDate=&endDate=`. */
export const GET = apiHandler<{ projectId: string; id: string; clusterId: string }>(async (req, ctx) => {
  const { projectId, id: signalId, clusterId } = await ctx.params;
  const params = req.nextUrl.searchParams;
  return Response.json(
    await getClusterDaily({
      projectId,
      signalId,
      clusterId,
      pastHours: params.get("pastHours") ?? undefined,
      startDate: params.get("startDate") ?? undefined,
      endDate: params.get("endDate") ?? undefined,
    })
  );
});
