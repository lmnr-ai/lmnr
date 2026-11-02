import { createChart, getCharts, updateChartsLayout } from "@/lib/actions/dashboard";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; dashboardId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, dashboardId } = await ctx.params;
  return Response.json(await getCharts({ projectId, dashboardId }));
});

export const PATCH = apiHandler<Params>(async (req, ctx) => {
  const { projectId, dashboardId } = await ctx.params;
  const body = await req.json();
  await updateChartsLayout({ ...body, projectId, dashboardId });
  return Response.json({ success: true });
});

export const POST = apiHandler<Params>(async (req, ctx) => {
  const { projectId, dashboardId } = await ctx.params;
  const body = await req.json();
  return Response.json(await createChart({ ...body, projectId, dashboardId }));
});
