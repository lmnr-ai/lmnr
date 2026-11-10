import { updateQueueAnnotationSchema } from "@/lib/actions/queue";
import { handlerWithAudit } from "@/lib/audit";

export const PUT = handlerWithAudit<{ projectId: string; queueId: string }>(
  { resource: "labeling_queue", action: "update" },
  async (request, ctx, audit) => {
    const { projectId, queueId } = await ctx.params;
    const body = await request.json();

    const updatedQueue = await updateQueueAnnotationSchema({
      projectId,
      queueId,
      annotationSchema: body?.annotationSchema ?? null,
    });
    await audit.target(queueId);

    return Response.json(updatedQueue);
  }
);
