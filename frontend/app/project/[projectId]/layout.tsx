import '@/app/globals.css';
import ProjectNavbarCollapsed from '@/components/project/project-navbar-collapsed';
import { ProjectContextProvider } from '@/contexts/project-context';
import { UserContextProvider } from '@/contexts/user-context';
import { authOptions } from '@/lib/auth';
import { fetcherJSON } from '@/lib/utils';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import PostHogClient from '@/app/posthog';
import { GetProjectResponse } from '@/lib/workspaces/types';
import ProjectUsageBanner from '@/components/project/usage-banner';
import { Feature, isFeatureEnabled } from '@/lib/features/features';

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
          <div className="flex flex-col h-screen flex-shrink-0">
            <ProjectNavbarCollapsed projectId={projectId} />
          </div>
          <div className="flex flex-col flex-grow min-h-screen max-w-full h-screen overflow-y-auto">
            {showBanner && (
              <ProjectUsageBanner
                workspaceId={project.workspaceId}
                spansThisMonth={project.spansThisMonth}
                spansLimit={project.spansLimit}
              />
            )}
            <div className="z-10 flex flex-col flex-grow">{children}</div>
          </div>
        </div>
      </ProjectContextProvider>
    </UserContextProvider>
  );
}
