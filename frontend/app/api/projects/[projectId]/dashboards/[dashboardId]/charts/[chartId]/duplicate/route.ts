import { duplicateChart } from "@/lib/actions/dashboard";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

export const POST = apiHandler<{ projectId: string; dashboardId: string; chartId: string }>(async (_req, ctx) => {
  const { projectId, dashboardId, chartId: id } = await ctx.params;
  const chart = await duplicateChart({ projectId, dashboardId, id });
  if (!chart) throw new NotFoundError("Chart not found");
  return Response.json(chart);
});
