import { z } from "zod/v4";

import { deleteCharts } from "@/lib/actions/dashboard";
import { ChartInputSchema, checkCharts, queryRunner } from "@/lib/actions/dashboard/chart-query";
import { upsertCharts } from "@/lib/actions/dashboard/upsert-charts";
import { SqlActorSchema } from "@/lib/actions/sql/actor";
import { internalApiHandler } from "@/lib/api/internal";
import { handlerNoAudit } from "@/lib/audit";

type Params = { projectId: string; dashboardId: string };

// `actor` is trusted here: only app-server can reach this route, and it resolved the caller.
const UpsertChartsBodySchema = z.object({ charts: z.array(ChartInputSchema), actor: SqlActorSchema });

export const PUT = handlerNoAudit(
  "CLI writes forwarded by app-server, which audits the originating /v1/cli call",
  internalApiHandler<Params>(async (request, { params: { projectId, dashboardId } }) => {
    const { charts, actor } = UpsertChartsBodySchema.parse(await request.json());
    const { upserts, warnings } = await checkCharts(charts, queryRunner(projectId, actor));
    return Response.json({ charts: await upsertCharts(projectId, dashboardId, upserts), warnings });
  })
);

export const DELETE = handlerNoAudit(
  "CLI writes forwarded by app-server, which audits the originating /v1/cli call",
  internalApiHandler<Params>(async (request, { params }) => {
    const { chartIds } = await request.json();
    return Response.json({ deleted: await deleteCharts({ ...params, chartIds }) });
  })
);
