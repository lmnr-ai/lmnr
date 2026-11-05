import { patchAlert } from "@/lib/actions/alerts";
import { withAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const PATCH = withAudit<{ projectId: string; alertId: string }>(
  { resource: "alert", action: "update" },
  async (request, ctx, audit) => {
    const { projectId, alertId } = await ctx.params;

    const session = await getServerSession();
    const userEmail = session?.user?.email ?? undefined;
    const body = await request.json();

    const result = await patchAlert({ projectId, alertId, userEmail, body });
    await audit.target(alertId);
    return Response.json(result);
  }
);
