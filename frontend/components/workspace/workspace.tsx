"use client";

import { WorkspaceStats } from "@/lib/usage/types";
import { WorkspaceInvitation, WorkspaceRole, WorkspaceWithUsers } from "@/lib/workspaces/types";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
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

export default function WorkspaceComponent({ invitations, workspace, workspaceStats, isOwner, currentUserRole }: WorkspaceProps) {
  return (
    <div className="flex flex-col">
      <Tabs defaultValue="usage">
        <TabsList className="px-4">
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="users">Team</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <div className="flex flex-col space-y-4">
          <TabsContent value="usage">
            <WorkspaceUsage workspace={workspace} workspaceStats={workspaceStats} isOwner={isOwner} />
          </TabsContent>
          <TabsContent value="users">
            <WorkspaceUsers
              invitations={invitations}
              workspace={workspace}
              workspaceStats={workspaceStats}
              isOwner={isOwner}
              currentUserRole={currentUserRole}
            />
          </TabsContent>
          <TabsContent value="settings">
            <WorkspaceSettings workspace={workspace} isOwner={isOwner} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
