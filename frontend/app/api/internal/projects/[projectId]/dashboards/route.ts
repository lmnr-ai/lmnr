import { type NextRequest } from "next/server";

import { createDashboard } from "@/lib/actions/dashboard/dashboards";
import { internalDashboardRoute } from "@/lib/actions/dashboard/internal-route";

export async function POST(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const { projectId } = await props.params;

  return internalDashboardRoute(req, projectId, async () => {
    const { name } = await req.json();
    return await createDashboard({ projectId, name });
  });
}
