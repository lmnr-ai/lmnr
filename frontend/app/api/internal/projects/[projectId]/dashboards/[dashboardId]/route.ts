import { deleteDashboard, renameDashboard } from "@/lib/actions/dashboard/dashboards";
import { withInternal } from "@/lib/internal-auth";

type Params = { projectId: string; dashboardId: string };

export const PATCH = withInternal<Params>(async (request, { params }) => {
  const { name } = await request.json();
  return Response.json(await renameDashboard({ ...params, name }));
});

export const DELETE = withInternal<Params>(async (_request, { params }) => {
  await deleteDashboard(params);
  return Response.json({ id: params.dashboardId, deleted: true });
});
