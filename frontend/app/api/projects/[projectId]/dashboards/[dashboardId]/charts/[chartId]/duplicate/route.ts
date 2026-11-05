import { duplicateChart } from "@/lib/actions/dashboard";
import { NotFoundError } from "@/lib/api/errors";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ projectId: string; dashboardId: string; chartId: string }>(
  { resource: "chart", action: "create" },
  async (_req, ctx, audit) => {
    const { projectId, dashboardId, chartId: id } = await ctx.params;
    const chart = await duplicateChart({ projectId, dashboardId, id });
    if (!chart) throw new NotFoundError("Chart not found");
    // The path's chartId is the source; the event records the copy.
    audit.set({ metadata: { sourceChartId: id } });
    await audit.target(chart.id, { name: chart.name });
    return Response.json(chart);
  }
);
