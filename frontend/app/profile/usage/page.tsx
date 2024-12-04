import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import Profile from '@/components/profile/profile';
import ProfileHeader from '@/components/profile/profile-header';
import WorkspacesNavbar from '@/components/projects/workspaces-navbar';
import { UserContextProvider } from '@/contexts/user-context';
import { authOptions } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Profile | Laminar'
};

export default async function ProfileUsagePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in?callbackUrl=/profile/usage');
  }
  const user = session.user;

  return (
    <UserContextProvider
      email={user.email!}
      supabaseAccessToken={session.supabaseAccessToken}
      username={user.name!}
      imageUrl={user.image!}
    >
      <WorkspacesNavbar />
      <div className="flex flex-col min-h-screen flex-grow overflow-auto ml-64">
        <ProfileHeader />
        <Profile />
      </div>
    </UserContextProvider>
  );
}
