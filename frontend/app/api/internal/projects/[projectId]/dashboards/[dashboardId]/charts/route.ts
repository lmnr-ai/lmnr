import { type NextRequest } from "next/server";
import { z } from "zod/v4";

import { deleteCharts } from "@/lib/actions/dashboard";
import { internalDashboardRoute } from "@/lib/actions/dashboard/internal-route";
import { ChartUpsertSchema, upsertCharts } from "@/lib/actions/dashboard/upsert-charts";

type Params = { params: Promise<{ projectId: string; dashboardId: string }> };

const UpsertChartsBodySchema = z.object({ charts: z.array(ChartUpsertSchema) });

export async function PUT(req: NextRequest, props: Params): Promise<Response> {
  const { projectId, dashboardId } = await props.params;

  return internalDashboardRoute(req, projectId, async () => {
    const { charts } = UpsertChartsBodySchema.parse(await req.json());
    return await upsertCharts(projectId, dashboardId, charts);
  });
}

export async function DELETE(req: NextRequest, props: Params): Promise<Response> {
  const { projectId, dashboardId } = await props.params;

  return internalDashboardRoute(req, projectId, async () => {
    const { chartIds } = await req.json();
    return { deleted: await deleteCharts({ projectId, dashboardId, chartIds }) };
  });
}
