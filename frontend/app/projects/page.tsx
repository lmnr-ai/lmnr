import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import Header from '@/components/ui/header';
import { Metadata } from 'next';
import Projects from '@/components/projects/projects';
import { redirect } from 'next/navigation';
import { UserContextProvider } from '@/contexts/user-context';
import WorkspacesNavbar from '@/components/projects/workspaces-navbar';

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
      <div className="flex flex-col min-h-screen flex-grow overflow-auto ml-64">
        <Header path="Projects" />
        <Projects isWorkspaceEnabled={isFeatureEnabled(Feature.WORKSPACE)} />
      </div>
    </UserContextProvider>
  );
}
