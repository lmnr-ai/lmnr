import { getSharedSpanPreviews } from "@/lib/actions/shared/spans/previews.ts";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "anonymous public-trace views are not audited",
  apiHandler<{ traceId: string }>(async (req, ctx) => {
    const { traceId } = await ctx.params;

    const body = await req.json();
    const { spanIds, spanTypes, startDate, endDate, inputSpanIds, promptHashes } = body;

    const result = await getSharedSpanPreviews({
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
