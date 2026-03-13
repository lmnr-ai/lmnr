import { pushQueueItems, PushQueueItemsRequestSchema } from "@/lib/actions/queue";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; queueId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const result = PushQueueItemsRequestSchema.safeParse(body);

  if (!result.success) {
    throw new Error("Invalid request body");
  }

  return await pushQueueItems({
    queueId: params.queueId,
    items: result.data,
  });
});
