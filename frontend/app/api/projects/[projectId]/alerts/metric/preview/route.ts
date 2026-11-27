import { previewMetricRule } from "@/lib/actions/alerts/metric";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "replays a rule over stored data; changes nothing",
  apiHandler<{ projectId: string }>(async (request, ctx) => {
    const { projectId } = await ctx.params;
    return Response.json(await previewMetricRule(projectId, await request.json()));
  })
);
