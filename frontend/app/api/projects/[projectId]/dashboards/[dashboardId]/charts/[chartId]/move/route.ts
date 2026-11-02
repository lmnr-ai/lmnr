import { moveChart } from "@/lib/actions/dashboard";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

export const POST = apiHandler<{ projectId: string; dashboardId: string; chartId: string }>(async (req, ctx) => {
  const { projectId, dashboardId, chartId: id } = await ctx.params;
  const body = await req.json();
  const chart = await moveChart({ projectId, dashboardId, id, targetDashboardId: body?.targetDashboardId });
  if (!chart) throw new NotFoundError("Chart or dashboard not found");
  return Response.json(chart);
});
