import { getTraceRenderData } from "@/lib/actions/trace/render-data";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "trace view sub-request; the trace route records trace.view",
  apiHandler<{ projectId: string; traceId: string }>(async (req, { params }) => {
    const { projectId, traceId } = await params;
    const body = await req.json();

    const result = await getTraceRenderData({ projectId, traceId, whereClause: body.whereClause });

    return Response.json(result);
  })
);
