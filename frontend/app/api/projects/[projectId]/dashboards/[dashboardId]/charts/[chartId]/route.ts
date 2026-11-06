import { deleteDashboardChart, getChart, updateChart, updateChartName } from "@/lib/actions/dashboard";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";
import { handlerWithAudit } from "@/lib/audit";

type Params = { projectId: string; dashboardId: string; chartId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, dashboardId, chartId: id } = await ctx.params;
  const chart = await getChart({ projectId, dashboardId, id });
  if (!chart) throw new NotFoundError("Chart not found");
  return Response.json(chart);
});

export const DELETE = handlerWithAudit<Params>({ resource: "chart", action: "delete" }, async (_req, ctx, audit) => {
  const { projectId, dashboardId, chartId: id } = await ctx.params;
  await audit.target(id, { parent: { dashboardId } });
  await deleteDashboardChart({ projectId, dashboardId, id });
  return Response.json({ success: true });
});

// PATCH is used for partial updates (name only)
export const PATCH = handlerWithAudit<Params>({ resource: "chart", action: "update" }, async (req, ctx, audit) => {
  const { projectId, dashboardId, chartId: id } = await ctx.params;
  const body = await req.json();
  await updateChartName({ ...body, projectId, dashboardId, id });
  await audit.target(id, { parent: { dashboardId } });
  return Response.json({ success: true });
});

export const PUT = handlerWithAudit<Params>({ resource: "chart", action: "update" }, async (req, ctx, audit) => {
  const { projectId, dashboardId, chartId: id } = await ctx.params;
  const body = await req.json();
  const chart = await updateChart({ ...body, projectId, dashboardId, id });
  await audit.target(id, { parent: { dashboardId } });
  return Response.json(chart);
});
