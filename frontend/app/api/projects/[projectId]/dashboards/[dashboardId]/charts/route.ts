import { createChart, getCharts, updateChartsLayout } from "@/lib/actions/dashboard";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

type Params = { projectId: string; dashboardId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, dashboardId } = await ctx.params;
  return Response.json(await getCharts({ projectId, dashboardId }));
});

export const PATCH = withAudit<Params>({ resource: "chart", action: "update" }, async (req, ctx, audit) => {
  const { projectId, dashboardId } = await ctx.params;
  const body = await req.json();
  await updateChartsLayout({ ...body, projectId, dashboardId });
  const chartIds: string[] = Array.isArray(body?.updates) ? body.updates.map((u: { id: string }) => u.id) : [];
  audit.set({
    resourceId: chartIds.length === 1 ? chartIds[0] : undefined,
    metadata: { dashboardId, chartIds, change: "layout" },
  });
  return Response.json({ success: true });
});

export const POST = withAudit<Params>({ resource: "chart", action: "create" }, async (req, ctx) => {
  const { projectId, dashboardId } = await ctx.params;
  const body = await req.json();
  return Response.json(await createChart({ ...body, projectId, dashboardId }));
});
