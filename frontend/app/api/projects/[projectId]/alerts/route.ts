import { createAlert, deleteAlert, getAlerts } from "@/lib/actions/alerts";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const GET = apiHandler<{ projectId: string }>(async (_request, ctx) => {
  const { projectId } = await ctx.params;

  const session = await getServerSession();
  const userEmail = session?.user?.email ?? undefined;
  const result = await getAlerts(projectId, userEmail);
  return Response.json(result);
});

export const POST = handlerWithAudit<{ projectId: string }>(
  { resource: "alert", action: "create" },
  async (request, ctx, audit) => {
    const { projectId } = await ctx.params;

    const session = await getServerSession();
    const userEmail = session?.user?.email;
    if (!userEmail) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const emailTargets = (body.targets ?? []).filter((t: { type: string; email?: string }) => t.type === "EMAIL");
    if (emailTargets.some((t: { email?: string }) => t.email && t.email !== userEmail)) {
      return Response.json({ error: "Cannot create alert targets for other users' emails." }, { status: 403 });
    }
    const result = await createAlert({ ...body, projectId });
    await audit.target(result.id);
    return Response.json(result);
  }
);

export const DELETE = handlerWithAudit<{ projectId: string }>(
  { resource: "alert", action: "delete" },
  async (request, ctx, audit) => {
    const { projectId } = await ctx.params;

    const body = await request.json();
    await audit.target(body.alertId);
    const result = await deleteAlert({ ...body, projectId });
    return Response.json(result);
  }
);
