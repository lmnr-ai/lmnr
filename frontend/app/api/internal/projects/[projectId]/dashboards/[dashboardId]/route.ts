import { type NextRequest } from "next/server";

import { deleteDashboard, renameDashboard } from "@/lib/actions/dashboard/dashboards";
import { internalDashboardRoute } from "@/lib/actions/dashboard/internal-route";

type Params = { params: Promise<{ projectId: string; dashboardId: string }> };

export async function PATCH(req: NextRequest, props: Params): Promise<Response> {
  const { projectId, dashboardId } = await props.params;

  return internalDashboardRoute(req, projectId, async () => {
    const { name } = await req.json();
    return await renameDashboard({ projectId, dashboardId, name });
  });
}

export async function DELETE(req: NextRequest, props: Params): Promise<Response> {
  const { projectId, dashboardId } = await props.params;

  return internalDashboardRoute(req, projectId, async () => {
    await deleteDashboard({ projectId, dashboardId });
    return { id: dashboardId, deleted: true };
  });
}
