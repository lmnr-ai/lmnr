import { cliAlertContext, createCliAlert } from "@/lib/actions/alerts/cli";
import { internalApiHandler } from "@/lib/api/internal";

export const POST = internalApiHandler<{ projectId: string }>(async (request, { params, claims }) => {
  const ctx = await cliAlertContext(params.projectId, claims);
  return Response.json(await createCliAlert(ctx, await request.json()));
});
