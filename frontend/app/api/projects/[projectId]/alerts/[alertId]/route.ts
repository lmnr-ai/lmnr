import { getServerSession } from "next-auth";

import { updateAlert } from "@/lib/actions/alerts";
import { apiHandler } from "@/lib/api/api-handler";
import { authOptions } from "@/lib/auth";

export const PATCH = apiHandler<{ projectId: string; alertId: string }>(async (request, ctx) => {
  const { projectId, alertId } = await ctx.params;

  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email ?? undefined;
  const body = await request.json();
  if (userEmail) {
    const emailTargets = (body.targets ?? []).filter((t: { type: string; email?: string }) => t.type === "EMAIL");
    if (emailTargets.some((t: { email?: string }) => t.email && t.email !== userEmail)) {
      return Response.json({ error: "Cannot set alert email targets for other users." }, { status: 403 });
    }
  }
  const result = await updateAlert({ ...body, projectId, alertId, userEmail });
  return Response.json(result);
});
