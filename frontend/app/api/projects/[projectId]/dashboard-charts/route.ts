import { createChart, getCharts, updateChartsLayout } from "@/lib/actions/dashboard";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  const charts = await getCharts({ projectId });
  return Response.json(charts);
});

export const PATCH = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  await updateChartsLayout({ projectId, ...body });
  return Response.json({ success: true });
});

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  const chart = await createChart({ projectId, ...body });
  return Response.json(chart);
});
