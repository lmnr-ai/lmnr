"use client";

import Projects from "@/components/projects/projects.tsx";
import { useWorkspaceMenuContext } from "@/components/workspace/workspace-menu-provider.tsx";
import { type SubscriptionDetails, type UpcomingInvoiceInfo } from "@/lib/actions/checkout/types";
import { type WorkspaceStats } from "@/lib/usage/types";
import { type WorkspaceInvitation, type WorkspaceRole, type WorkspaceWithOptionalUsers } from "@/lib/workspaces/types";

import WorkspaceDeployment from "./deployment-settings/workspace-deployment.tsx";
import WorkspaceBilling from "./workspace-billing";
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
  isBillingEnabled: boolean;
}

export default function WorkspaceComponent({
  invitations,
  workspace,
  workspaceStats,
  isOwner,
  currentUserRole,
  subscription,
  upcomingInvoice,
  isBillingEnabled,
}: WorkspaceProps) {
  const { menu } = useWorkspaceMenuContext();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4 py-8">
        {menu === "projects" && <Projects workspaceId={workspace.id} />}
        {menu === "team" && (
          <WorkspaceUsers
            invitations={invitations}
            workspace={workspace}
            isOwner={isOwner}
            currentUserRole={currentUserRole}
          />
        )}
        {menu === "usage" && <WorkspaceUsage workspaceStats={workspaceStats} isBillingEnabled={isBillingEnabled} />}
        {isBillingEnabled && menu === "billing" && (
          <WorkspaceBilling
            workspace={workspace}
            isOwner={isOwner}
            subscription={subscription}
            upcomingInvoice={upcomingInvoice}
          />
        )}
        {menu === "settings" && <WorkspaceSettings workspace={workspace} isOwner={isOwner} />}
        {menu === "deployment" && <WorkspaceDeployment workspace={workspace} />}
      </div>
    </div>
  );
}
