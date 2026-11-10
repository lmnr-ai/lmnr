import { getTraceSpanOutline } from "@/lib/actions/trace/span-outline";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; traceId: string }>(async (_req, ctx) => {
  const { projectId, traceId } = await ctx.params;
  return Response.json(await getTraceSpanOutline({ projectId, traceId }));
});
