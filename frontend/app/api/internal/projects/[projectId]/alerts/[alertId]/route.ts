import { z } from "zod/v4";

import { cliAlertContext, deleteCliAlert, updateCliAlert } from "@/lib/actions/alerts/cli";
import { internalApiHandler } from "@/lib/api/internal";

type Params = { projectId: string; alertId: string };

export const PATCH = internalApiHandler<Params>(async (request, { params, claims }) => {
  const ctx = await cliAlertContext(params.projectId, claims);
  return Response.json(await updateCliAlert(ctx, z.guid().parse(params.alertId), await request.json()));
});

export const DELETE = internalApiHandler<Params>(async (_request, { params, claims }) => {
  const ctx = await cliAlertContext(params.projectId, claims);
  await deleteCliAlert(ctx, z.guid().parse(params.alertId));
  return Response.json({ id: params.alertId, deleted: true });
});
