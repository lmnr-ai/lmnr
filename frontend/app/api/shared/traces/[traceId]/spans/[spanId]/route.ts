import { getSharedSpan } from "@/lib/actions/shared/span";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ traceId: string; spanId: string }>(async (_req, ctx) => {
  const { traceId, spanId } = await ctx.params;
  return Response.json(await getSharedSpan({ traceId, spanId }));
});
