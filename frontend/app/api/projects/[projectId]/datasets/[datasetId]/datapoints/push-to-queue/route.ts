import { pushDatapointsToQueue, PushDatapointsToQueueSchema } from "@/lib/actions/datapoints";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string; datasetId: string }>(async (req, ctx) => {
  const { projectId, datasetId } = await ctx.params;
  const body = await req.json();

  const result = PushDatapointsToQueueSchema.omit({ projectId: true, datasetId: true }).safeParse(body);
  if (!result.success) {
    return Response.json({ error: "Invalid request body", details: result.error.issues }, { status: 400 });
  }

  const { datapointIds, queueId } = result.data;

  const queueItems = await pushDatapointsToQueue({ datapointIds, projectId, datasetId, queueId });

  return Response.json({
    success: true,
    message: `Successfully pushed ${datapointIds.length} datapoints to queue`,
    queueItems,
  });
});
