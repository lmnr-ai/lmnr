import { authOptions } from '@/lib/auth';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import ProjectsHeader from '@/components/projects/projects-header';

import Projects from '@/components/projects/projects';
import { UserContextProvider } from '@/contexts/user-context';
import WorkspacesNavbar from '@/components/projects/workspaces-navbar';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Projects',
}


export default async function ProjectsPage() {

  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }
  const user = session.user;

  return (
    <UserContextProvider email={user.email!} supabaseAccessToken={session.supabaseAccessToken} username={user.name!} imageUrl={user.image!}>
      <WorkspacesNavbar />
      <div className="flex flex-col min-h-screen flex-grow overflow-auto ml-64">
        <ProjectsHeader />
        <Projects />
      </div>
    </UserContextProvider >
  )
}
