import { pushQueueItems, PushQueueItemsRequestSchema } from "@/lib/actions/queue";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; queueId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const result = PushQueueItemsRequestSchema.safeParse(body);

  if (!result.success) {
    throw new HttpError("Invalid request body", 400);
  }

  return await pushQueueItems({
    queueId: params.queueId,
    items: result.data,
  });
});
