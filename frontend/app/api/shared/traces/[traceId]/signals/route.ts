import { getSharedTraceSignals } from "@/lib/actions/shared/signals";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ traceId: string }>(async (_req, ctx) => {
  const { traceId } = await ctx.params;
  return Response.json(await getSharedTraceSignals({ traceId }));
});
