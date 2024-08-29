import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetcherJSON } from "@/lib/utils";
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import WorkspaceHeader from '@/components/workspace/workspace-header';
import { WorkspaceWithInfo } from '@/lib/workspaces/types';
import WorkspaceUsers from '@/components/workspace/workspace-users';
import WorkspacesNavbar from '@/components/projects/workspaces-navbar';
import { UserContextProvider } from '@/contexts/user-context';
import { UserStats } from '@/lib/profile/types';

export const metadata: Metadata = {
  title: 'Workspace',
}


const getWorkspace = async (workspaceId: string) => {
  const session = await getServerSession(authOptions)
  const user = session!.user
  const res = await fetcherJSON(`/workspaces/${workspaceId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    },
  });
  return await res
}

const getUserLimits = async () => {
  const session = await getServerSession(authOptions)
  const user = session!.user
  return await fetcherJSON(`/limits/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${user.apiKey}`
    },
  }) as UserStats;
}

export default async function WorkspacePage(
  { params }: { params: { workspaceId: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect('/sign-in');
  }
  const user = session.user;

  const workspace: WorkspaceWithInfo = await getWorkspace(params.workspaceId);
  const isOwner = workspace.users.find(u => u.email === user.email && u.name === user.name)?.role === 'owner';
  const limits = await getUserLimits();
  const maxUsers = limits.membersPerWorkspace < 0 ? undefined : limits.membersPerWorkspace + limits.additionalSeats;

  return (
    <UserContextProvider email={user.email!} supabaseAccessToken={session.supabaseAccessToken} username={user.name!} imageUrl={user.image!}>
      <WorkspacesNavbar />
      <div className="flex flex-col min-h-screen flex-grow overflow-auto ml-64">
        <WorkspaceHeader workspaceName={workspace.name} />
        <div className="flex flex-col p-4">

          <h1 className="text-xl mb-4">{workspace.name}</h1>
          <WorkspaceUsers
            workspaceId={workspace.id}
            workspaceUsers={workspace.users}
            isOwner={isOwner}
            maxUsers={maxUsers} />
        </div>
      </div>
    </UserContextProvider>
  )
}
