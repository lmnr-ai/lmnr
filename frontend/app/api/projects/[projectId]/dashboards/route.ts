import { createDashboard, getDashboards, getOrCreateDefaultDashboard } from "@/lib/actions/dashboard/dashboards";
import { apiHandler } from "@/lib/api/api-handler";

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

export const POST = apiHandler<Params>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  return Response.json(await createDashboard({ ...body, projectId }));
});
