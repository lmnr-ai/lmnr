'use client';

import useSWR from 'swr';

import { useUserContext } from '@/contexts/user-context';
import { swrFetcher } from '@/lib/utils';
import { Workspace } from '@/lib/workspaces/types';

import { Label } from '../ui/label';
import { Skeleton } from '../ui/skeleton';
import SubscriptionTierCard from './subscription-tier-card';
import WorkspaceCards from './workspace-cards';

export default function Usage() {
  const user = useUserContext();

  const {
    data: ownedWorkspaces,
    isLoading: isWorkspacesLoading,
    error: workspacesError
  } = useSWR<Workspace[]>('/api/workspaces?accessLevel=owner', swrFetcher);

  return isWorkspacesLoading || workspacesError || !ownedWorkspaces ? (
    <Skeleton className="h-full p-4 w-full flex-grow" />
  ) : (
    <div className="h-full p-4 w-full flex-grow">
      <div className="flex flex-col items-start space-y-4">
        <div className="flex flex-row space-x-2">
          <Label className="font-bold mb-4">email</Label>
          <Label className="text-secondary-foreground">{user.email}</Label>
        </div>
        <SubscriptionTierCard />
        {/* <UserUsage stats={userInfo} /> */}
      </div>
      <WorkspaceCards workspaces={ownedWorkspaces} />
    </div>
  );
}
