import { getTraceSignals } from "@/lib/actions/signals";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; traceId: string }>(async (_req, ctx) => {
  const { projectId, traceId } = await ctx.params;
  return Response.json(await getTraceSignals({ projectId, traceId }));
});
