import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { cn, fetcherJSON } from '@/lib/utils';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { WorkspaceWithUsers } from '@/lib/workspaces/types';
import WorkspacesNavbar from '@/components/projects/workspaces-navbar';
import { UserContextProvider } from '@/contexts/user-context';
import { WorkspaceStats } from '@/lib/usage/types';
import WorkspaceComponent from '@/components/workspace/workspace';
import Header from '@/components/ui/header';
import { Feature, isFeatureEnabled } from '@/lib/features/features';

export const metadata: Metadata = {
  title: 'Workspace'
};

const getWorkspace = async (
  workspaceId: string
): Promise<WorkspaceWithUsers> => {
  const session = await getServerSession(authOptions);
  const user = session!.user;
  const res = await fetcherJSON(`/workspaces/${workspaceId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  });
  return await res;
};

const getWorkspaceStats = async (
  workspaceId: string
): Promise<WorkspaceStats> => {
  const session = await getServerSession(authOptions);
  const user = session!.user;
  return (await fetcherJSON(`/limits/workspace/${workspaceId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    }
  })) as WorkspaceStats;
};

export default async function WorkspacePage({
  params
}: {
  params: { workspaceId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }
  const user = session.user;

  if (!isFeatureEnabled(Feature.WORKSPACE)) {
    redirect('/projects');
  }

  // check if user part of the workspace
  const workspace = await getWorkspace(params.workspaceId);
  const isMember = workspace.users.find((u) => u.email === user.email);

  if (!isMember) {
    redirect('/not-found');
  }

  const isOwner =
    workspace.users.find((u) => u.email === user.email)?.role === 'owner';

  const stats = await getWorkspaceStats(params.workspaceId);

  return (
    <UserContextProvider
      email={user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={user.name!}
      imageUrl={user.image!}
    >
      <WorkspacesNavbar />
      <div className="flex flex-col min-h-screen flex-grow overflow-auto ml-64">
        <div className="flex flex-row justify-between items-center">
          <div className="text-lg font-medium p-4 pb-2 flex items-center gap-2">
            <span className="">{workspace.name}</span>
            <div className={cn("text-xs text-secondary-foreground p-0.5 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20", workspace.tierName === 'Pro' && 'border-primary bg-primary/10 text-primary')}>
              {workspace.tierName}
            </div>
          </div>
        </div>
        <WorkspaceComponent
          workspace={workspace}
          workspaceStats={stats}
          isOwner={isOwner}
        />
      </div>
    </UserContextProvider>
  );
}
