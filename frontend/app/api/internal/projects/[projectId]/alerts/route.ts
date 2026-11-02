import { cliAlertContext, createCliAlert } from "@/lib/actions/alerts/cli";
import { withInternal } from "@/lib/internal-auth";

export const POST = withInternal<{ projectId: string }>(async (request, { params, claims }) => {
  const ctx = await cliAlertContext(params.projectId, claims);
  return Response.json(await createCliAlert(ctx, await request.json()));
});
