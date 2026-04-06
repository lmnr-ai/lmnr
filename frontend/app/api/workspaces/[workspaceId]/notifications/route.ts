import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { getWebNotifications, markNotificationAsRead } from "@/lib/actions/notifications";
import { authOptions } from "@/lib/auth";
import { isUserMemberOfWorkspace } from "@/lib/authorization";

export async function GET(request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await isUserMemberOfWorkspace(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId query parameter is required" }, { status: 400 });
    }
    const result = await getWebNotifications(workspaceId, session.user.id, projectId);
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
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await isUserMemberOfWorkspace(workspaceId, session.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const { notificationId, projectId } = body;
    if (!notificationId || !projectId) {
      return NextResponse.json({ error: "notificationId and projectId are required" }, { status: 400 });
    }
    await markNotificationAsRead(session.user.id, notificationId, projectId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to mark notification as read." },
      { status: 500 }
    );
  }
}
