import { deleteDashboard, renameDashboard } from "@/lib/actions/dashboard/dashboards";
import { internalApiHandler } from "@/lib/api/internal";

type Params = { projectId: string; dashboardId: string };

export const PATCH = internalApiHandler<Params>(async (request, { params }) => {
  const { name } = await request.json();
  return Response.json(await renameDashboard({ ...params, name }));
});

export const DELETE = internalApiHandler<Params>(async (_request, { params }) => {
  await deleteDashboard(params);
  return Response.json({ id: params.dashboardId, deleted: true });
});
