import { getSpanPreviews } from "@/lib/actions/spans/previews";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string; traceId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const { projectId, traceId } = params;

  const body = await req.json();
  const { spanIds, spanTypes, startDate, endDate, inputSpanIds, promptHashes } = body;

  const result = await getSpanPreviews({
    projectId,
    traceId,
    spanIds,
    spanTypes,
    startDate,
    endDate,
    inputSpanIds,
    promptHashes,
  });

  return Response.json(result);
});
