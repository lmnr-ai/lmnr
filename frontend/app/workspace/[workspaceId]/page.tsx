import { eq } from "drizzle-orm";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import WorkspaceSidebar from "@/components/workspace/sidebar";
import WorkspaceComponent from "@/components/workspace/workspace";
import WorkspaceMenuProvider from "@/components/workspace/workspace-menu-provider.tsx";
import { UserContextProvider } from "@/contexts/user-context";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import {
  membersOfWorkspaces,
  subscriptionTiers,
  users,
  workspaceInvitations,
  workspaces,
} from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { getWorkspaceStats } from "@/lib/usage/workspace-stats";
import { WorkspaceWithUsers } from "@/lib/workspaces/types";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspacePage(props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in");
  }
  const user = session.user;

  if (!isFeatureEnabled(Feature.WORKSPACE)) {
    redirect("/projects");
  }

  // check if user part of the workspace
  const res = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
    })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, params.workspaceId))
    .limit(1);

  const workspace = res[0] as WorkspaceWithUsers;

  if (!workspace) {
    return notFound();
  }

  // get all users in the workspace
  const workspaceUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: membersOfWorkspaces.memberRole,
      createdAt: membersOfWorkspaces.createdAt,
    })
    .from(users)
    .innerJoin(membersOfWorkspaces, eq(users.id, membersOfWorkspaces.userId))
    .where(eq(membersOfWorkspaces.workspaceId, params.workspaceId));

  workspace.users = workspaceUsers;

  const isMember = workspaceUsers.find((u) => u.email === user.email);

  if (!isMember) {
    return notFound();
  }

  const currentUser = workspace.users.find((u) => u.email === user.email);
  const isOwner = currentUser?.role === "owner";
  const currentUserRole = currentUser?.role || "member";

  const stats = await getWorkspaceStats(params.workspaceId);

  const invitations = await db.query.workspaceInvitations.findMany({
    where: eq(workspaceInvitations.workspaceId, params.workspaceId),
  });

  return (
    <UserContextProvider
      id={user.id}
      email={user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={user.name!}
      imageUrl={user.image!}
    >
      <WorkspaceMenuProvider>
        <div className="flex flex-1 overflow-hidden max-h-screen">
          <SidebarProvider className="bg-sidebar">
            <WorkspaceSidebar isOwner={isOwner} workspace={workspace} />
            <SidebarInset className="overflow-hidden mt-4 flex flex-col h-full rounded-tl-lg border">
              <WorkspaceComponent
                invitations={invitations}
                workspace={workspace}
                workspaceStats={stats}
                isOwner={isOwner}
                currentUserRole={currentUserRole}
              />
            </SidebarInset>
          </SidebarProvider>
        </div>
      </WorkspaceMenuProvider>
    </UserContextProvider>
  );
}
