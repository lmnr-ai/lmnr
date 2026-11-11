import { patchAlert } from "@/lib/actions/alerts";
import { handlerWithAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const PATCH = handlerWithAudit<{ projectId: string; alertId: string }>(
  { resource: "alert", action: "update" },
  async (request, ctx, audit) => {
    const { projectId, alertId } = await ctx.params;

    const session = await getServerSession();
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();

    const result = await patchAlert({
      projectId,
      alertId,
      userId: session.user.id,
      userEmail: session.user.email ?? undefined,
      body,
    });
    await audit.target(alertId);
    return Response.json(result);
  }
);
