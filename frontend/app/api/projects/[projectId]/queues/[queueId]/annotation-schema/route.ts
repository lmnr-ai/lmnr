import { updateQueueAnnotationSchema } from "@/lib/actions/queue";
import { apiHandler } from "@/lib/api/api-handler";

export const PUT = apiHandler<{ projectId: string; queueId: string }>(async (request, ctx) => {
  const { projectId, queueId } = await ctx.params;
  const body = await request.json();

  const updatedQueue = await updateQueueAnnotationSchema({
    projectId,
    queueId,
    annotationSchema: body?.annotationSchema ?? null,
  });

  return Response.json(updatedQueue);
});
