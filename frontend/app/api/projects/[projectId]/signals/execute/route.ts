import { executeSignal } from "@/lib/actions/signals/execute";
import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";

export const POST = noAudit(
  "test run of an unsaved signal on a trace the user opened (logged as trace.view); changes nothing",
  apiHandler<{ projectId: string }>(async (req, ctx) => {
    const { projectId } = await ctx.params;
    const body = await req.json();
    const result = await executeSignal({ ...body, projectId });

    return Response.json(result);
  })
);
