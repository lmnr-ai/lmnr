import { createDashboard, getDashboards, getOrCreateDefaultDashboard } from "@/lib/actions/dashboard/dashboards";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

type Params = { projectId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  const dashboards = await getDashboards({ projectId });

  if (dashboards.length > 0) {
    return Response.json(dashboards);
  }

  // Callers outside the dashboards page (e.g. the SQL editor's export dialog)
  // may be the first to touch a project that has never had a dashboard.
  await getOrCreateDefaultDashboard({ projectId });

  return Response.json(await getDashboards({ projectId }));
});

export const POST = handlerWithAudit<Params>({ resource: "dashboard", action: "create" }, async (req, ctx, audit) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  const dashboard = await createDashboard({ ...body, projectId });
  await audit.target(dashboard.id, { name: dashboard.name });
  return Response.json(dashboard);
});
