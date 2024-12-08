import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import Projects from '@/components/projects/projects';
import WorkspacesNavbar from '@/components/projects/workspaces-navbar';
import Header from '@/components/ui/header';
import { UserContextProvider } from '@/contexts/user-context';
import { authOptions } from '@/lib/auth';
import { Feature, isFeatureEnabled } from '@/lib/features/features';

export const metadata: Metadata = {
  title: 'Projects'
};

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in?callbackUrl=/onboarding');
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
      <div className="flex flex-col flex-grow min-h-screen ml-64 overflow-auto">
        <Header path="Projects" showSidebarTrigger={false} />
        <Projects isWorkspaceEnabled={isFeatureEnabled(Feature.WORKSPACE)} />
      </div>
    </UserContextProvider>
  );
}
