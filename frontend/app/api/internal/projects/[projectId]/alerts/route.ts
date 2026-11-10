import { cliAlertContext, createCliAlert } from "@/lib/actions/alerts/cli";
import { internalApiHandler } from "@/lib/api/internal";
import { handlerNoAudit } from "@/lib/audit";

export const POST = handlerNoAudit(
  "CLI writes forwarded by app-server, which audits the originating /v1/cli call",
  internalApiHandler<{ projectId: string }>(async (request, { params, claims }) => {
    const ctx = await cliAlertContext(params.projectId, claims);
    return Response.json(await createCliAlert(ctx, await request.json()));
  })
);
