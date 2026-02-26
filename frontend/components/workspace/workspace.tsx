"use client";

import Projects from "@/components/projects/projects.tsx";
import { useWorkspaceMenuContext } from "@/components/workspace/workspace-menu-provider.tsx";
import { type SubscriptionDetails, type UpcomingInvoiceInfo } from "@/lib/actions/checkout/types";
import { type WorkspaceStats } from "@/lib/actions/usage/types";
import { type WorkspaceInvitation, type WorkspaceRole, type WorkspaceWithOptionalUsers } from "@/lib/workspaces/types";

import WorkspaceBilling from "./billing";
import WorkspaceDeployment from "./deployment-settings/workspace-deployment.tsx";
import WorkspaceSettings from "./workspace-settings";
import WorkspaceUsage from "./workspace-usage";
import WorkspaceUsers from "./workspace-users";

interface WorkspaceProps {
  invitations: WorkspaceInvitation[];
  workspace: WorkspaceWithOptionalUsers;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
  currentUserRole: WorkspaceRole;
  subscription: SubscriptionDetails | null;
  upcomingInvoice: UpcomingInvoiceInfo | null;
  isCloud: boolean;
  canManageBilling: boolean;
}

export default function WorkspaceComponent({
  invitations,
  workspace,
  workspaceStats,
  isOwner,
  currentUserRole,
  subscription,
  upcomingInvoice,
  isCloud,
  canManageBilling,
}: WorkspaceProps) {
  const { menu } = useWorkspaceMenuContext();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4 py-8">
        {menu === "projects" && <Projects workspace={workspace} isCloud={isCloud} />}
        {menu === "team" && (
          <WorkspaceUsers
            invitations={invitations}
            workspace={workspace}
            isOwner={isOwner}
            currentUserRole={currentUserRole}
            isCloud={isCloud}
          />
        )}
        {menu === "usage" && <WorkspaceUsage workspaceStats={workspaceStats} isCloud={isCloud} />}
        {isCloud && menu === "billing" && (
          <WorkspaceBilling
            workspace={workspace}
            isOwner={isOwner}
            canManageBilling={canManageBilling}
            subscription={subscription}
            upcomingInvoice={upcomingInvoice}
          />
        )}
        {menu === "settings" && <WorkspaceSettings workspace={workspace} isOwner={isOwner} />}
        {isCloud && menu === "deployment" && <WorkspaceDeployment workspace={workspace} />}
      </div>
    </div>
  );
}
