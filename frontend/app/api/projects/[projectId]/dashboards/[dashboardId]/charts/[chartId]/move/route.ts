import { moveChart } from "@/lib/actions/dashboard";
import { NotFoundError } from "@/lib/api/errors";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ projectId: string; dashboardId: string; chartId: string }>(
  { resource: "chart", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, dashboardId, chartId: id } = await ctx.params;
    const body = await req.json();
    const chart = await moveChart({ projectId, dashboardId, id, targetDashboardId: body?.targetDashboardId });
    if (!chart) throw new NotFoundError("Chart or dashboard not found");
    audit.set({ metadata: { fromDashboardId: dashboardId } });
    await audit.target(id, { parent: { dashboardId: body?.targetDashboardId } });
    return Response.json(chart);
  }
);
