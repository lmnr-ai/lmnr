"use client";

import Projects from "@/components/projects/projects.tsx";
import { useWorkspaceMenuContext } from "@/components/workspace/workspace-menu-provider.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type SubscriptionDetails, type UpcomingInvoiceInfo } from "@/lib/actions/checkout/types";
import { type WorkspaceStats } from "@/lib/actions/usage/types";
import { Feature } from "@/lib/features/features";
import { type WorkspaceInvitation, type WorkspaceRole, type WorkspaceWithOptionalUsers } from "@/lib/workspaces/types";

import WorkspaceBilling from "./billing";
import WorkspaceDeployment from "./deployment-settings/workspace-deployment.tsx";
import WorkspaceReports from "./reports";
import WorkspaceUsage from "./usage";
import WorkspaceIntegrations from "./workspace-integrations";
import WorkspaceSettings from "./workspace-settings";
import WorkspaceUsers from "./workspace-users";

interface WorkspaceProps {
  invitations: WorkspaceInvitation[];
  workspace: WorkspaceWithOptionalUsers;
  workspaceStats: WorkspaceStats | null;
  isOwner: boolean;
  currentUserRole: WorkspaceRole;
  subscription: SubscriptionDetails | null;
  upcomingInvoice: UpcomingInvoiceInfo | null;
  canManageBilling: boolean;
  slackClientId?: string;
  slackRedirectUri?: string;
}

export default function WorkspaceComponent({
  invitations,
  workspace,
  workspaceStats,
  isOwner,
  currentUserRole,
  subscription,
  upcomingInvoice,
  canManageBilling,
  slackClientId,
  slackRedirectUri,
}: WorkspaceProps) {
  const { menu } = useWorkspaceMenuContext();
  const featureFlags = useFeatureFlags();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4 py-8">
        {menu === "projects" && <Projects workspace={workspace} />}
        {menu === "team" && (
          <WorkspaceUsers
            invitations={invitations}
            workspace={workspace}
            isOwner={isOwner}
            currentUserRole={currentUserRole}
          />
        )}
        {menu === "usage" && <WorkspaceUsage workspaceStats={workspaceStats} workspace={workspace} isOwner={isOwner} />}
        {featureFlags[Feature.SUBSCRIPTION] && menu === "billing" && (
          <WorkspaceBilling
            workspace={workspace}
            isOwner={isOwner}
            canManageBilling={canManageBilling}
            subscription={subscription}
            upcomingInvoice={upcomingInvoice}
          />
        )}
        {menu === "integrations" && (
          <WorkspaceIntegrations
            workspaceId={workspace.id}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
          />
        )}
        {menu === "reports" && (
          <WorkspaceReports
            workspaceId={workspace.id}
            slackClientId={slackClientId}
            slackRedirectUri={slackRedirectUri}
          />
        )}
        {menu === "settings" && <WorkspaceSettings workspace={workspace} isOwner={isOwner} />}
        {featureFlags[Feature.DEPLOYMENT] && menu === "deployment" && <WorkspaceDeployment workspace={workspace} />}
      </div>
    </div>
  );
}
