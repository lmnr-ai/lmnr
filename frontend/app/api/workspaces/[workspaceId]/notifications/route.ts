import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { getWebNotifications, markNotificationAsRead } from "@/lib/actions/notifications";
import { authOptions } from "@/lib/auth";
import { isProjectInWorkspace } from "@/lib/authorization";

export async function GET(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId query parameter is required" }, { status: 400 });
    }
    if (!(await isProjectInWorkspace(projectId, workspaceId))) {
      return NextResponse.json({ error: "Project does not belong to this workspace" }, { status: 400 });
    }
    const result = await getWebNotifications({ workspaceId, userId, projectId });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch notifications." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { notificationId, projectId } = body;
    if (!notificationId || !projectId) {
      return NextResponse.json({ error: "notificationId and projectId are required" }, { status: 400 });
    }
    if (!(await isProjectInWorkspace(projectId, workspaceId))) {
      return NextResponse.json({ error: "Project does not belong to this workspace" }, { status: 400 });
    }
    await markNotificationAsRead({ userId, notificationId, projectId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mark notification as read." },
      { status: 500 }
    );
  }
}
