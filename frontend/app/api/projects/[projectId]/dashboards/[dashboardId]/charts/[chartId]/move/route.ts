import { moveChart } from "@/lib/actions/dashboard";
import { NotFoundError } from "@/lib/api/errors";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ projectId: string; dashboardId: string; chartId: string }>(
  { resource: "chart", action: "update" },
  async (req, ctx) => {
    const { projectId, dashboardId, chartId: id } = await ctx.params;
    const body = await req.json();
    const chart = await moveChart({ projectId, dashboardId, id, targetDashboardId: body?.targetDashboardId });
    if (!chart) throw new NotFoundError("Chart or dashboard not found");
    return Response.json(chart);
  }
);
