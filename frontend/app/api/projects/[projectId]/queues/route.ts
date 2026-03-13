import { parseUrlParams } from "@/lib/actions/common/utils";
import { createQueue, deleteQueues, getQueues, GetQueuesSchema } from "@/lib/actions/queues";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  return await createQueue({
    projectId: params.projectId,
    name: body.name,
  });
});

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);

  const parseResult = parseUrlParams(searchParams, GetQueuesSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await getQueues({
    ...parseResult.data,
    projectId: params.projectId,
  });
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);
  const queueIds = searchParams.get("queueIds")?.split(",");

  if (!queueIds) {
    throw new Error("At least one Queue ID is required");
  }

  await deleteQueues({
    projectId: params.projectId,
    queueIds,
  });

  return { message: "Queues deleted successfully" };
});
