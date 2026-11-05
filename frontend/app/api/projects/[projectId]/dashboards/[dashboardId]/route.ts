import { deleteDashboard, renameDashboard } from "@/lib/actions/dashboard/dashboards";
import { withAudit } from "@/lib/audit";

type Params = { projectId: string; dashboardId: string };

export const PATCH = withAudit<Params>({ resource: "dashboard", action: "update" }, async (req, ctx, audit) => {
  const { projectId, dashboardId } = await ctx.params;
  const body = await req.json();
  const dashboard = await renameDashboard({ ...body, projectId, dashboardId });
  await audit.target(dashboardId);
  return Response.json(dashboard);
});

export const DELETE = withAudit<Params>({ resource: "dashboard", action: "delete" }, async (_req, ctx, audit) => {
  const params = await ctx.params;
  await audit.target(params.dashboardId);
  await deleteDashboard(params);
  return Response.json({ success: true });
});
