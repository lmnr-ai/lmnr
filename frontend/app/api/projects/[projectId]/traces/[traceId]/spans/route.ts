import { parseUrlParams } from "@/lib/actions/common/utils";
import { getTraceSpans, GetTraceSpansSchema } from "@/lib/actions/spans";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; traceId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetTraceSpansSchema.omit({ traceId: true, projectId: true })
  );

  if (!parseResult.success) {
    return Response.json([]);
  }

  const result = await getTraceSpans({ ...parseResult.data, projectId, traceId });
  return Response.json(result);
});
