import { removeQueueItem, RemoveQueueItemRequestSchema } from "@/lib/actions/queue";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; queueId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const result = RemoveQueueItemRequestSchema.safeParse(body);

  if (!result.success) {
    throw new Error("Invalid request body");
  }

  const { id, data, target, metadata, datasetId, skip } = result.data;

  await removeQueueItem({
    queueId: params.queueId,
    id,
    skip,
    datasetId,
    data,
    target,
    metadata,
    projectId: params.projectId,
  });

  return { success: true };
});
