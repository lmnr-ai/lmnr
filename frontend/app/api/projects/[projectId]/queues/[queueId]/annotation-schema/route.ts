import { updateQueueAnnotationSchema } from "@/lib/actions/queue";
import { handleRoute } from "@/lib/api/route-handler";

export const PUT = handleRoute<{ projectId: string; queueId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  return await updateQueueAnnotationSchema({
    queueId: params.queueId,
    projectId: params.projectId,
    ...body,
  });
});
