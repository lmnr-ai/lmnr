import { getTraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  return Response.json(await getTraceSpanCounts({ ...body, projectId }));
});
