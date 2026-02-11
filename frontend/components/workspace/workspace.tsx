"use client";

import Projects from "@/components/projects/projects.tsx";
import { useWorkspaceMenuContext } from "@/components/workspace/workspace-menu-provider.tsx";
import { type WorkspaceStats } from "@/lib/usage/types";
import { type WorkspaceInvitation, type WorkspaceRole, type WorkspaceWithOptionalUsers } from "@/lib/workspaces/types";

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
  workspaceFeatureEnabled: boolean;
}

export default function WorkspaceComponent({
  invitations,
  workspace,
  workspaceStats,
  isOwner,
  currentUserRole,
  workspaceFeatureEnabled,
}: WorkspaceProps) {
  const { menu } = useWorkspaceMenuContext();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4 py-8">
        {menu === "projects" && <Projects workspaceId={workspace.id} />}
        {workspaceFeatureEnabled && menu === "team" && (
          <WorkspaceUsers
            invitations={invitations}
            workspace={workspace}
            workspaceStats={workspaceStats}
            isOwner={isOwner}
            currentUserRole={currentUserRole}
          />
        )}
        {workspaceFeatureEnabled && menu === "usage" && (
          <WorkspaceUsage workspace={workspace} workspaceStats={workspaceStats} isOwner={isOwner} />
        )}
        {workspaceFeatureEnabled && menu === "settings" && (
          <WorkspaceSettings workspace={workspace} isOwner={isOwner} />
        )}
        {workspaceFeatureEnabled && menu === "deployment" && (
          <WorkspaceDeployment workspace={workspace} />
        )}
      </div>
    </div>
  );
}
