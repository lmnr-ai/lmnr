import { pushQueueItems, PushQueueItemsRequestSchema } from "@/lib/actions/queue";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "per-item labeling traffic",
  apiHandler<{ projectId: string; queueId: string }>(async (req, ctx) => {
    const { projectId, queueId } = await ctx.params;
    const body = await req.json();
    const result = PushQueueItemsRequestSchema.safeParse(body);

    if (!result.success) {
      return Response.json({ error: "Invalid request body", details: result.error }, { status: 400 });
    }

    return Response.json(await pushQueueItems({ projectId, queueId, items: result.data }));
  })
);
