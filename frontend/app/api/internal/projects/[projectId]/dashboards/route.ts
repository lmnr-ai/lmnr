import { createDashboard } from "@/lib/actions/dashboard/dashboards";
import { internalApiHandler } from "@/lib/api/internal";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "CLI writes forwarded by app-server, which audits the originating /v1/cli call",
  internalApiHandler<{ projectId: string }>(async (request, { params }) => {
    const { name } = await request.json();
    return Response.json(await createDashboard({ projectId: params.projectId, name }));
  })
);
