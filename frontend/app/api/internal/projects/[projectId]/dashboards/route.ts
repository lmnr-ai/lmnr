import { createDashboard } from "@/lib/actions/dashboard/dashboards";
import { withInternal } from "@/lib/internal-auth";

export const POST = withInternal<{ projectId: string }>(async (request, { params }) => {
  const { name } = await request.json();
  return Response.json(await createDashboard({ projectId: params.projectId, name }));
});
