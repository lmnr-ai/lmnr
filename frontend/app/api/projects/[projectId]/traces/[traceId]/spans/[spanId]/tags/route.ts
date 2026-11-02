import { getSpanTags } from "@/lib/actions/tags";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; traceId: string; spanId: string }>(async (_req, ctx) => {
  const { projectId, traceId, spanId } = await ctx.params;
  return Response.json(await getSpanTags({ projectId, traceId, spanId }));
});
