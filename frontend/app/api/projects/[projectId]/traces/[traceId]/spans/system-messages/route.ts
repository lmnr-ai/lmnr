import { getTraceSystemMessages } from "@/lib/actions/spans/system-messages";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "trace view sub-request; the trace route records trace.view",
  apiHandler<{ projectId: string; traceId: string }>(async (req, ctx) => {
    const params = await ctx.params;
    const { projectId, traceId } = params;

    const body = await req.json();
    const paths = body.paths as string[][];

    if (!Array.isArray(paths)) {
      return Response.json({ error: "paths must be an array of path arrays" }, { status: 400 });
    }

    const systemMessages = await getTraceSystemMessages({ projectId, traceId, paths });

    return Response.json(systemMessages);
  })
);
