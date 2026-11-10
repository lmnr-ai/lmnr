import { pushDatapointsToQueue, PushDatapointsToQueueSchema } from "@/lib/actions/datapoints";
import { handlerWithAudit } from "@/lib/audit";

export const POST = handlerWithAudit<{ projectId: string; datasetId: string }>(
  { resource: "labeling_queue", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, datasetId } = await ctx.params;
    const body = await req.json();

    const result = PushDatapointsToQueueSchema.omit({ projectId: true, datasetId: true }).safeParse(body);
    if (!result.success) {
      return Response.json({ error: "Invalid request body", details: result.error.issues }, { status: 400 });
    }

    const { datapointIds, queueId } = result.data;
    audit.set({ metadata: { datasetId, datapointIds } });
    await audit.target(queueId);

    const queueItems = await pushDatapointsToQueue({ datapointIds, projectId, datasetId, queueId });

    return Response.json({
      success: true,
      message: `Successfully pushed ${datapointIds.length} datapoints to queue`,
      queueItems,
    });
  }
);
