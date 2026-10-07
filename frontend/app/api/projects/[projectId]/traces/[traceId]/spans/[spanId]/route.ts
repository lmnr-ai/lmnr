import { getSpan } from "@/lib/actions/span";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; traceId: string; spanId: string }>(async (_req, ctx) => {
  const params = await ctx.params;
  const { projectId, traceId, spanId } = params;

  const span = await getSpan({ spanId, traceId, projectId });

  return Response.json(span);
});
