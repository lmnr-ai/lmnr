import { deleteDashboardChart, getChart, updateChart, updateChartName } from "@/lib/actions/dashboard";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (_req, ctx) => {
  const { projectId, id } = await ctx.params;
  const chart = await getChart({ projectId, id });

  if (!chart) {
    return Response.json({ error: "Chart not found" }, { status: 404 });
  }

  return Response.json(chart);
});

export const DELETE = apiHandler<{ projectId: string; id: string }>(async (_req, ctx) => {
  const { projectId, id } = await ctx.params;
  await deleteDashboardChart({ projectId, id });
  return Response.json({ success: true });
});

export const PATCH = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id } = await ctx.params;
  const body = await req.json();
  await updateChartName({ projectId, id, ...body });
  return Response.json({ success: true });
});

export const PUT = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id } = await ctx.params;
  const body = await req.json();
  const chart = await updateChart({ projectId, id, ...body });
  return Response.json(chart);
});
