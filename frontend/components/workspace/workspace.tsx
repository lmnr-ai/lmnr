'use client';

import { WorkspaceStats } from '@/lib/usage/types';
import { WorkspaceWithUsers } from '@/lib/workspaces/types';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import WorkspaceUsage from './workspace-usage';
import WorkspaceUsers from './workspace-users';

interface WorkspaceProps {
  workspace: WorkspaceWithUsers;
  workspaceStats: WorkspaceStats;
  isOwner: boolean;
}

export default function WorkspaceComponent({
  workspace,
  workspaceStats,
  isOwner
}: WorkspaceProps) {
  return (
    <div className="flex flex-col">
      <Tabs defaultValue="usage">
        <TabsList className="px-4">
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="users">Team</TabsTrigger>
        </TabsList>
        <div className="flex flex-col space-y-4">
          <TabsContent value="usage">
            <WorkspaceUsage
              workspace={workspace}
              workspaceStats={workspaceStats}
              isOwner={isOwner}
            />
          </TabsContent>
          <TabsContent value="users">
            <WorkspaceUsers
              workspace={workspace}
              workspaceStats={workspaceStats}
              isOwner={isOwner}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
