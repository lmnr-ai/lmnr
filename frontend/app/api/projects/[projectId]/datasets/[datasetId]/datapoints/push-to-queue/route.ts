import { pushDatapointsToQueue, PushDatapointsToQueueSchema } from "@/lib/actions/datapoints";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; datasetId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  const result = PushDatapointsToQueueSchema.omit({ projectId: true, datasetId: true }).safeParse(body);
  if (!result.success) {
    throw new Error("Invalid request body");
  }

  const { datapointIds, queueId } = result.data;

  const queueItems = await pushDatapointsToQueue({
    datapointIds,
    projectId: params.projectId,
    datasetId: params.datasetId,
    queueId,
  });

  return {
    success: true,
    message: `Successfully pushed ${datapointIds.length} datapoints to queue`,
    queueItems,
  };
});
