import { moveQueueItem, MoveQueueRequestSchema } from "@/lib/actions/queue";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string; queueId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const parsedBody = MoveQueueRequestSchema.safeParse(body);
  if (!parsedBody.success) {
    throw new Error("Invalid request body");
  }

  const { refDate, refId, direction } = parsedBody.data;

  const result = await moveQueueItem({
    queueId: params.queueId,
    refDate,
    refId,
    direction,
  });

  return result || {};
});
