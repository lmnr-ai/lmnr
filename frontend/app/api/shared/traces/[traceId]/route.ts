import { getSharedTrace } from "@/lib/actions/shared/trace";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ traceId: string }>(async (_req, ctx) => {
  const params = await ctx.params;
  const traceId = params.traceId;

  const trace = await getSharedTrace({ traceId });

  if (!trace) {
    return new Response(JSON.stringify({ error: "Trace not found" }), { status: 404 });
  }

  return Response.json(trace);
});
