import { updateQueueAnnotationSchema } from "@/lib/actions/queue";
import { apiHandler } from "@/lib/api/api-handler";

export const PUT = apiHandler<{ projectId: string; queueId: string }>(async (request, ctx) => {
  const params = await ctx.params;

  const body = await request.json();

  const updatedQueue = await updateQueueAnnotationSchema({
    ...body,
    queueId: params.queueId,
    projectId: params.projectId,
  });

  return Response.json(updatedQueue);
});
