import { addSpanTag, getSpanTags } from "@/lib/actions/tags";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; spanId: string }, unknown>(async (_req, params) => {
  const { spanId, projectId } = params;

  return await getSpanTags({ spanId, projectId });
});

export const POST = handleRoute<{ projectId: string; spanId: string }, unknown>(async (req, params) => {
  const { projectId, spanId } = params;

  const body = (await req.json()) as { name: string };

  return await addSpanTag({ spanId, projectId, name: body.name });
});
