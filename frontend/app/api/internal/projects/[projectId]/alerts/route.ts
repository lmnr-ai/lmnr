import { cliAlertContext, createCliAlert } from "@/lib/actions/alerts/cli";
import { internalApiHandler } from "@/lib/api/internal";
import { noAudit } from "@/lib/audit";

export const POST = noAudit(
  "CLI writes forwarded by app-server, which audits the originating /v1/cli call",
  internalApiHandler<{ projectId: string }>(async (request, { params, claims }) => {
    const ctx = await cliAlertContext(params.projectId, claims);
    return Response.json(await createCliAlert(ctx, await request.json()));
  })
);
