import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import WorkspaceSidebar from "@/components/workspace/sidebar";
import WorkspaceComponent from "@/components/workspace/workspace";
import WorkspaceMenuProvider from "@/components/workspace/workspace-menu-provider.tsx";
import { getSubscriptionDetails, getUpcomingInvoice } from "@/lib/actions/checkout";
import { getWorkspaceStats } from "@/lib/actions/usage/workspace-stats";
import { getWorkspace } from "@/lib/actions/workspace";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function WorkspacePage(props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;

  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in");
  }

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

  // Check if billing feature is enabled (Laminar Cloud only)
  const isBillingEnabled = isFeatureEnabled(Feature.BILLING);
  const canManageBilling = isBillingEnabled && ["owner", "admin"].includes(currentUserRole);

  // Fetch subscription details for paid tiers (only for owners/admins)
  const isPaidTier = workspace.tierName !== "Free";
  let subscription = null;
  let upcomingInvoice = null;

  if (canManageBilling && isPaidTier) {
    try {
      [subscription, upcomingInvoice] = await Promise.all([
        getSubscriptionDetails(params.workspaceId),
        getUpcomingInvoice(params.workspaceId),
      ]);
    } catch (error) {
      console.error("Error fetching subscription details:", error);
    }
  }

  return (
    <WorkspaceMenuProvider>
      <div className="fixed inset-0 flex overflow-hidden md:pt-2 bg-sidebar">
        <SidebarProvider className="bg-sidebar">
          <WorkspaceSidebar isOwner={isOwner} workspace={workspace} isBillingEnabled={isBillingEnabled} />
          <SidebarInset className="flex flex-col flex-1 md:rounded-tl-lg border h-full overflow-hidden">
            <WorkspaceComponent
              invitations={invitations}
              workspace={workspace}
              workspaceStats={stats}
              isOwner={isOwner}
              currentUserRole={currentUserRole}
              subscription={subscription}
              upcomingInvoice={upcomingInvoice}
              isBillingEnabled={isBillingEnabled}
              canManageBilling={canManageBilling}
            />
          </SidebarInset>
        </SidebarProvider>
      </div>
    </WorkspaceMenuProvider>
  );
}
