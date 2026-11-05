import { updateQueueAnnotationSchema } from "@/lib/actions/queue";
import { withAudit } from "@/lib/audit";

export const PUT = withAudit<{ projectId: string; queueId: string }>(
  { resource: "labeling_queue", action: "update" },
  async (request, ctx) => {
    const { projectId, queueId } = await ctx.params;
    const body = await request.json();

    const updatedQueue = await updateQueueAnnotationSchema({
      projectId,
      queueId,
      annotationSchema: body?.annotationSchema ?? null,
    });

    return Response.json(updatedQueue);
  }
);
