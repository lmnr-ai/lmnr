import { and, eq } from "drizzle-orm";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import WorkspaceSidebar from "@/components/workspace/sidebar";
import WorkspaceComponent from "@/components/workspace/workspace";
import WorkspaceMenuProvider from "@/components/workspace/workspace-menu-provider.tsx";
import { UserContextProvider } from "@/contexts/user-context";
import { getWorkspace } from "@/lib/actions/workspace";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { getWorkspaceStats } from "@/lib/usage/workspace-stats";
import { WorkspaceWithOptionalUsers } from "@/lib/workspaces/types";
import { requireWorkspaceAccess } from "@/lib/authorization";

export const metadata: Metadata = {
  title: "Workspace",
};

export default async function WorkspacePage(props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;

  const session = await requireWorkspaceAccess(params.workspaceId);
  const user = session.user;

  const workspace = await getWorkspace({ workspaceId: params.workspaceId });

  const userMembership = await db
    .select({ role: membersOfWorkspaces.memberRole })
    .from(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.userId, user.id), eq(membersOfWorkspaces.workspaceId, params.workspaceId)))
    .limit(1)
    .then((res) => res[0]);

  if (!userMembership) {
    return notFound();
  }

  const isOwner = userMembership.role === "owner";
  const currentUserRole = userMembership.role || "member";

  const stats = await getWorkspaceStats(params.workspaceId);

  const invitations = await db.query.workspaceInvitations.findMany({
    where: eq(workspaceInvitations.workspaceId, params.workspaceId),
  });

  const workspaceFeatureEnabled = isFeatureEnabled(Feature.WORKSPACE);

  return (
    <UserContextProvider
      id={user.id}
      email={user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={user.name!}
      imageUrl={user.image!}
    >
      <WorkspaceMenuProvider>
        <div className="fixed inset-0 flex overflow-hidden md:pt-2 bg-sidebar">
          <SidebarProvider className="bg-sidebar">
            <WorkspaceSidebar
              isOwner={isOwner}
              workspace={workspace}
              workspaceFeatureEnabled={workspaceFeatureEnabled}
            />
            <SidebarInset className="flex flex-col flex-1 md:rounded-tl-lg border h-full overflow-hidden">
              <WorkspaceComponent
                invitations={invitations}
                workspace={workspace}
                workspaceStats={stats}
                isOwner={isOwner}
                currentUserRole={currentUserRole}
                workspaceFeatureEnabled={workspaceFeatureEnabled}
              />
            </SidebarInset>
          </SidebarProvider>
        </div>
      </WorkspaceMenuProvider>
    </UserContextProvider>
  );
}
