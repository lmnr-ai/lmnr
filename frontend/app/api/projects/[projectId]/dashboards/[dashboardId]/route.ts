import { deleteDashboard, renameDashboard } from "@/lib/actions/dashboard/dashboards";
import { withAudit } from "@/lib/audit";

type Params = { projectId: string; dashboardId: string };

export const PATCH = withAudit<Params>({ resource: "dashboard", action: "update" }, async (req, ctx) => {
  const { projectId, dashboardId } = await ctx.params;
  const body = await req.json();
  return Response.json(await renameDashboard({ ...body, projectId, dashboardId }));
});

export const DELETE = withAudit<Params>({ resource: "dashboard", action: "delete" }, async (_req, ctx) => {
  await deleteDashboard(await ctx.params);
  return Response.json({ success: true });
});
