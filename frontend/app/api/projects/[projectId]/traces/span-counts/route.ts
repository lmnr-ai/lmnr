import { getTraceSpanCounts } from "@/lib/actions/traces/span-counts";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "session thread sub-request; reads span counts for traces the page already loaded",
  apiHandler<{ projectId: string }>(async (req, ctx) => {
    const { projectId } = await ctx.params;
    const body = await req.json();
    return Response.json(await getTraceSpanCounts({ ...body, projectId }));
  })
);
