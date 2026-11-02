import { z } from "zod/v4";

import { deleteCliAlert, updateCliAlert } from "@/lib/actions/alerts/cli";
import { internalAlertRoute } from "@/lib/actions/alerts/internal-route";

type Params = { params: Promise<{ projectId: string; alertId: string }> };

export async function PATCH(request: Request, props: Params) {
  const { projectId, alertId } = await props.params;
  return internalAlertRoute(request, projectId, async (ctx) =>
    updateCliAlert(ctx, z.guid().parse(alertId), await request.json())
  );
}

export async function DELETE(request: Request, props: Params) {
  const { projectId, alertId } = await props.params;
  return internalAlertRoute(request, projectId, async (ctx) => {
    await deleteCliAlert(ctx, z.guid().parse(alertId));
    return { id: alertId, deleted: true };
  });
}
