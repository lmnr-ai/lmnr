import { deleteDashboard, renameDashboard } from "@/lib/actions/dashboard/dashboards";
import { internalApiHandler } from "@/lib/api/internal";
import { noAudit } from "@/lib/audit";

type Params = { projectId: string; dashboardId: string };

export const PATCH = noAudit(
  "CLI writes forwarded by app-server, which audits the originating /v1/cli call",
  internalApiHandler<Params>(async (request, { params }) => {
    const { name } = await request.json();
    return Response.json(await renameDashboard({ ...params, name }));
  })
);

export const DELETE = noAudit(
  "CLI writes forwarded by app-server, which audits the originating /v1/cli call",
  internalApiHandler<Params>(async (_request, { params }) => {
    await deleteDashboard(params);
    return Response.json({ id: params.dashboardId, deleted: true });
  })
);
