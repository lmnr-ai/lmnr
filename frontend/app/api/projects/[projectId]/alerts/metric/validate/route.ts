import { validateMetricRule } from "@/lib/actions/alerts/metric";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "checks a rule; changes nothing",
  apiHandler<{ projectId: string }>(async (request, ctx) => {
    const { projectId } = await ctx.params;
    const { rule } = await request.json();
    return Response.json(await validateMetricRule(projectId, rule));
  })
);
