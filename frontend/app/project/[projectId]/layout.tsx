import '@/app/globals.css';

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import PostHogClient from '@/app/posthog';
import ProjectNavbar from '@/components/project/project-navbar';
import ProjectUsageBanner from '@/components/project/usage-banner';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ProjectContextProvider } from '@/contexts/project-context';
import { UserContextProvider } from '@/contexts/user-context';
import { authOptions } from '@/lib/auth';
import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { fetcherJSON } from '@/lib/utils';
import { GetProjectResponse } from '@/lib/workspaces/types';

export default async function ProjectIdLayout({
  params,
  children
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/sign-in');
  }
  const user = session.user;

  const projectResponse = await fetcherJSON(`/projects/${projectId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user.apiKey}`
    }
  });

  const project = projectResponse as GetProjectResponse;

  const showBanner =
    isFeatureEnabled(Feature.WORKSPACE) &&
    project.isFreeTier &&
    project.spansThisMonth >= 0.8 * project.spansLimit;

  const posthog = PostHogClient();
  posthog.identify({
    distinctId: user.email ?? ''
  });

  return (
    <UserContextProvider
      email={user.email!}
      username={user.name!}
      imageUrl={user.image!}
      supabaseAccessToken={session.supabaseAccessToken}
    >
      <ProjectContextProvider projectId={project.id} projectName={project.name}>
        <div className="flex flex-row max-w-full max-h-screen">
          <SidebarProvider>
            <div className="flex flex-col flex-shrink-0 h-screen">
              <ProjectNavbar
                projectId={projectId}
                fullBuild={isFeatureEnabled(Feature.FULL_BUILD)}
              />
            </div>
            <div className="flex flex-col flex-grow h-screen max-w-full min-h-screen overflow-y-auto">
              {showBanner && (
                <ProjectUsageBanner
                  workspaceId={project.workspaceId}
                  spansThisMonth={project.spansThisMonth}
                  spansLimit={project.spansLimit}
                />
              )}
              <div className="z-10 flex flex-col flex-grow ">{children}</div>
            </div>
          </SidebarProvider>
        </div>
      </ProjectContextProvider>
    </UserContextProvider>
  );
}
