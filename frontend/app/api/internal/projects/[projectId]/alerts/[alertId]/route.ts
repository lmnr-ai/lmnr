import { z } from "zod/v4";

import { cliAlertContext, deleteCliAlert, updateCliAlert } from "@/lib/actions/alerts/cli";
import { withInternal } from "@/lib/internal-auth";

type Params = { projectId: string; alertId: string };

export const PATCH = withInternal<Params>(async (request, { params, claims }) => {
  const ctx = await cliAlertContext(params.projectId, claims);
  return Response.json(await updateCliAlert(ctx, z.guid().parse(params.alertId), await request.json()));
});

export const DELETE = withInternal<Params>(async (_request, { params, claims }) => {
  const ctx = await cliAlertContext(params.projectId, claims);
  await deleteCliAlert(ctx, z.guid().parse(params.alertId));
  return Response.json({ id: params.alertId, deleted: true });
});
