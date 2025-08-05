import { and, count, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { apiKeys, membersOfWorkspaces } from "@/lib/db/migrations/schema";
import { isCurrentUserMemberOfWorkspace } from "@/lib/db/utils";

export async function PATCH(req: NextRequest, props: { params: Promise<{ workspaceId: string }> }): Promise<Response> {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  if (!(await isCurrentUserMemberOfWorkspace(params.workspaceId))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // Check if current user is owner or admin
  const currentUserRole = await db
    .select({ memberRole: membersOfWorkspaces.memberRole })
    .from(membersOfWorkspaces)
    .innerJoin(apiKeys, eq(membersOfWorkspaces.userId, apiKeys.userId))
    .where(
      and(
        eq(membersOfWorkspaces.workspaceId, params.workspaceId),
        eq(apiKeys.apiKey, user.apiKey)
      )
    );

  if (currentUserRole.length === 0) {
    return new Response(JSON.stringify({ error: "User not found in workspace" }), { status: 404 });
  }

  const userRole = currentUserRole[0].memberRole;
  if (userRole !== "owner" && userRole !== "admin") {
    return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403 });
  }

  const body = (await req.json()) as { userId: string; newRole: "member" | "admin" };
  const { userId, newRole } = body;

  if (!userId || !newRole) {
    return new Response(JSON.stringify({ error: "Missing userId or newRole" }), { status: 400 });
  }

  if (newRole !== "member" && newRole !== "admin") {
    return new Response(JSON.stringify({ error: "Invalid role. Can only set to 'member' or 'admin'" }), { status: 400 });
  }

  // Check if target user exists in workspace
  const targetUser = await db
    .select({ memberRole: membersOfWorkspaces.memberRole })
    .from(membersOfWorkspaces)
    .where(
      and(
        eq(membersOfWorkspaces.workspaceId, params.workspaceId),
        eq(membersOfWorkspaces.userId, userId)
      )
    );

  if (targetUser.length === 0) {
    return new Response(JSON.stringify({ error: "Target user not found in workspace" }), { status: 404 });
  }

  // Don't allow changing owner role
  if (targetUser[0].memberRole === "owner") {
    return new Response(JSON.stringify({ error: "Cannot change owner role" }), { status: 403 });
  }

  // Update the user's role
  await db
    .update(membersOfWorkspaces)
    .set({ memberRole: newRole })
    .where(
      and(
        eq(membersOfWorkspaces.workspaceId, params.workspaceId),
        eq(membersOfWorkspaces.userId, userId)
      )
    );

  return new Response(JSON.stringify({ success: true, message: "User role updated successfully" }), { status: 200 });
}