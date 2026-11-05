import { getSpanPreviews } from "@/lib/actions/spans/previews";
import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";

export const POST = noAudit(
  "trace view sub-request; the trace route records trace.view",
  apiHandler<{ projectId: string; traceId: string }>(async (req, ctx) => {
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
  })
);
