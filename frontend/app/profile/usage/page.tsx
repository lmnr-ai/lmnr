import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';

import { UserContextProvider } from '@/contexts/user-context';
import WorkspacesNavbar from '@/components/projects/workspaces-navbar';
import { Metadata } from 'next';
import ProfileHeader from '@/components/profile/profile-header';
import Usage from '@/components/profile/usage';

export const metadata: Metadata = {
  title: 'Profile | Laminar',
}

export default async function ProfileUsagePage() {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in?callbackUrl=/profile/usage');
  }
  const user = session.user;

  return (
    <UserContextProvider email={user.email!} supabaseAccessToken={session.supabaseAccessToken} username={user.name!} imageUrl={user.image!}>
      <WorkspacesNavbar />
      <div className="flex flex-col min-h-screen flex-grow overflow-auto ml-64">
        <ProfileHeader />
        <Usage />
      </div>
    </UserContextProvider >
  )
}
