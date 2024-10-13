'use client';

import { WorkspaceWithUsers } from '@/lib/workspaces/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

interface WorkspaceProps {
  workspace: WorkspaceWithUsers;
  isOwner: boolean;
}

export default function WorkspaceComponent({
  workspace,
  isOwner,
}: WorkspaceProps) {
  return (
    <div className="flex flex-col">
      {workspace.name}
    </div>
  );
}
