"use client";

import Projects from "@/components/projects/projects.tsx";
import { useWorkspaceMenuContext } from "@/components/workspace/workspace-menu-provider.tsx";
import { Feature, isFeatureEnabled } from "@/lib/features/features.ts";
import { WorkspaceStats } from "@/lib/usage/types";
import { WorkspaceInvitation, WorkspaceRole, WorkspaceWithUsers } from "@/lib/workspaces/types";

import WorkspaceSettings from "./workspace-settings";
import WorkspaceUsage from "./workspace-usage";
import WorkspaceUsers from "./workspace-users";

interface WorkspaceProps {
  invitations: WorkspaceInvitation[];
  workspace: WorkspaceWithUsers;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
  currentUserRole: WorkspaceRole;
}

export default function WorkspaceComponent({
  invitations,
  workspace,
  workspaceStats,
  isOwner,
  currentUserRole,
}: WorkspaceProps) {
  const { menu } = useWorkspaceMenuContext();
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4 py-8">
        {menu === "projects" && (
          <Projects workspaceId={workspace.id} isWorkspaceEnabled={isFeatureEnabled(Feature.WORKSPACE)} />
        )}
        {menu === "team" && (
          <WorkspaceUsers
            invitations={invitations}
            workspace={workspace}
            workspaceStats={workspaceStats}
            isOwner={isOwner}
            currentUserRole={currentUserRole}
          />
        )}
        {menu === "usage" && <WorkspaceUsage workspace={workspace} workspaceStats={workspaceStats} isOwner={isOwner} />}
        {menu === "settings" && <WorkspaceSettings workspace={workspace} isOwner={isOwner} />}
      </div>
    </div>
  );
}
