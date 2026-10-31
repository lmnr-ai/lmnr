import { type NextRequest } from "next/server";
import { z } from "zod/v4";

import { cliAlertErrorResponse, deleteCliAlert, updateCliAlert } from "@/lib/actions/alerts/cli";
import { authorizeCliProject } from "@/lib/auth-cli";

type Params = { params: Promise<{ projectId: string; alertId: string }> };

export async function PATCH(request: NextRequest, props: Params) {
  const { projectId, alertId } = await props.params;
  try {
    const auth = await authorizeCliProject(request, projectId);
    if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
    const ctx = { projectId, userEmail: auth.user.email };
    return Response.json(await updateCliAlert(ctx, z.guid().parse(alertId), await request.json()));
  } catch (error) {
    return cliAlertErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, props: Params) {
  const { projectId, alertId } = await props.params;
  try {
    const auth = await authorizeCliProject(request, projectId);
    if ("error" in auth) return Response.json({ error: auth.error }, { status: auth.status });
    await deleteCliAlert({ projectId, userEmail: auth.user.email }, z.guid().parse(alertId));
    return Response.json({ id: alertId, deleted: true });
  } catch (error) {
    return cliAlertErrorResponse(error);
  }
}
