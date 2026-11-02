import { createDashboard } from "@/lib/actions/dashboard/dashboards";
import { internalApiHandler } from "@/lib/api/internal";

export const POST = internalApiHandler<{ projectId: string }>(async (request, { params }) => {
  const { name } = await request.json();
  return Response.json(await createDashboard({ projectId: params.projectId, name }));
});
