import { getSharedSpans } from "@/lib/actions/shared/spans";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ traceId: string }>(async (req, ctx) => {
  const { traceId } = await ctx.params;

  const result = await getSharedSpans({ traceId });

  return Response.json(result);
});
