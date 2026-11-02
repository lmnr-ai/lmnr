import { deleteDashboard, renameDashboard } from "@/lib/actions/dashboard/dashboards";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; dashboardId: string };

export const PATCH = apiHandler<Params>(async (req, ctx) => {
  const { projectId, dashboardId } = await ctx.params;
  const body = await req.json();
  return Response.json(await renameDashboard({ ...body, projectId, dashboardId }));
});

export const DELETE = apiHandler<Params>(async (_req, ctx) => {
  await deleteDashboard(await ctx.params);
  return Response.json({ success: true });
});
