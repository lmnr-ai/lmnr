import "@/app/globals.css";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ReactNode } from "react";

import PostHogClient from "@/app/posthog";
import PostHogIdentifier from "@/app/posthog-identifier";
import ProjectSidebar from "@/components/project/sidebar";
import ProjectUsageBanner from "@/components/project/usage-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProjectContextProvider } from "@/contexts/project-context";
import { UserContextProvider } from "@/contexts/user-context";
import { getProjectDetails } from "@/lib/actions/project";
import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { getWorkspaceInfo } from "@/lib/actions/workspace";
import { authOptions } from "@/lib/auth";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

const projectSidebarCookieName = "project-sidebar-state";

export default async function ProjectIdLayout(props: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  const { children } = props;

  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in");
  }
  const user = session.user;

  const projectDetails = await getProjectDetails(projectId);
  const workspace = await getWorkspaceInfo(projectDetails.workspaceId);
  const projects = await getProjectsByWorkspace(projectDetails.workspaceId);
  const showBanner =
    isFeatureEnabled(Feature.WORKSPACE) &&
    projectDetails.isFreeTier &&
    projectDetails.gbLimit > 0 &&
    projectDetails.gbUsedThisMonth >= 0.8 * projectDetails.gbLimit;

  const posthog = PostHogClient();
  posthog.identify({
    distinctId: user.email ?? "",
  });

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get(projectSidebarCookieName)
    ? cookieStore.get(projectSidebarCookieName)?.value === "true"
    : true;

  return (
    <UserContextProvider
      id={user.id}
      email={user.email!}
      username={user.name!}
      imageUrl={user.image!}
      supabaseAccessToken={session.supabaseAccessToken}
    >
      <PostHogIdentifier email={user.email!} />
      <ProjectContextProvider workspace={workspace} projects={projects} project={projectDetails}>
        <div className="fixed inset-0 flex overflow-hidden md:pt-2 bg-sidebar">
          <SidebarProvider cookieName={projectSidebarCookieName} className="bg-sidebar" defaultOpen={defaultOpen}>
            <ProjectSidebar details={projectDetails} />
            <SidebarInset className="flex flex-col h-[calc(100%-8px)]! border-l border-t flex-1 md:rounded-tl-lg overflow-hidden">
              {showBanner && <ProjectUsageBanner details={projectDetails} />}
              {children}
            </SidebarInset>
          </SidebarProvider>
        </div>
      </ProjectContextProvider>
    </UserContextProvider>
  );
}
