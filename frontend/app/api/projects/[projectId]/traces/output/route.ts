import { getAgentOutputsBatch } from "@/lib/actions/traces/outputs";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "traces table sub-request; the list route records trace.list",
  apiHandler<{ projectId: string }>(async (req, ctx) => {
    const { projectId } = await ctx.params;
    const body = await req.json();
    const result = await getAgentOutputsBatch({ ...body, projectId });
    return Response.json(result);
  })
);
