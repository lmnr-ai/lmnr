import { eq } from 'drizzle-orm';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import WorkspacesNavbar from '@/components/projects/workspaces-navbar';
import WorkspaceComponent from '@/components/workspace/workspace';
import { UserContextProvider } from '@/contexts/user-context';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { membersOfWorkspaces, subscriptionTiers, users, workspaces } from '@/lib/db/migrations/schema';
import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { WorkspaceStats } from '@/lib/usage/types';
import { cn, fetcherJSON } from '@/lib/utils';
import { WorkspaceWithUsers } from '@/lib/workspaces/types';

export const metadata: Metadata = {
  title: 'Workspace'
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
  const res = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      tierName: subscriptionTiers.name,
    })
    .from(workspaces)
    .innerJoin(
      subscriptionTiers,
      eq(workspaces.tierId, subscriptionTiers.id)
    )
    .where(
      eq(workspaces.id, params.workspaceId)
    ).limit(1);

  const workspace = res[0] as WorkspaceWithUsers;

  if (!workspace) {
    return notFound();
  }

  // get all users in the workspace
  const workspaceUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: membersOfWorkspaces.memberRole,
      createdAt: membersOfWorkspaces.createdAt
    })
    .from(users)
    .innerJoin(membersOfWorkspaces, eq(users.id, membersOfWorkspaces.userId))
    .where(eq(membersOfWorkspaces.workspaceId, params.workspaceId));

  workspace.users = workspaceUsers;

  const isMember = workspaceUsers.find((u) => u.email === user.email);

  if (!isMember) {
    return notFound();
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
