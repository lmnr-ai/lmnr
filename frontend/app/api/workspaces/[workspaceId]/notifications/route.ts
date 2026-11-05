import { getWebNotifications, markNotificationsAsRead } from "@/lib/actions/notifications";
import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";
import { isProjectInWorkspace } from "@/lib/authorization";

type Params = { workspaceId: string };

export const GET = apiHandler<Params>(async (request, ctx) => {
  const { workspaceId } = await ctx.params;
  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return Response.json({ error: "projectId query parameter is required" }, { status: 400 });
  }
  if (!(await isProjectInWorkspace(projectId, workspaceId))) {
    return Response.json({ error: "Project does not belong to this workspace" }, { status: 400 });
  }
  return Response.json(await getWebNotifications({ userId, projectId, workspaceId }));
});

export const POST = noAudit(
  "per-user notification read state",
  apiHandler<Params>(async (request, ctx) => {
    const { workspaceId } = await ctx.params;
    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { notificationIds, projectId } = await request.json();
    if (!projectId || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return Response.json({ error: "projectId and notificationIds are required" }, { status: 400 });
    }
    if (!(await isProjectInWorkspace(projectId, workspaceId))) {
      return Response.json({ error: "Project does not belong to this workspace" }, { status: 400 });
    }
    await markNotificationsAsRead({ userId, notificationIds, projectId });
    return Response.json({ success: true });
  })
);
