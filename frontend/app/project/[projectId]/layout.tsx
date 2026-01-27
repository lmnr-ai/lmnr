import "@/app/globals.css";

import { cookies } from "next/headers";
import { type ReactNode } from "react";

import PostHogClient from "@/app/posthog";
import PostHogIdentifier from "@/app/posthog-identifier";
import SessionSyncProvider from "@/components/auth/session-sync-provider";
import ProjectSidebar from "@/components/project/sidebar";
import ProjectUsageBanner from "@/components/project/usage-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProjectContextProvider } from "@/contexts/project-context";
import { UserContextProvider } from "@/contexts/user-context";
import { getProjectDetails } from "@/lib/actions/project";
import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { getWorkspaceInfo } from "@/lib/actions/workspace";
import { requireProjectAccess } from "@/lib/authorization";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

const projectSidebarCookieName = "project-sidebar-state";

export default async function ProjectIdLayout(props: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  const { children } = props;

  const projectId = params.projectId;
  const session = await requireProjectAccess(projectId);
  const projectDetails = await getProjectDetails(projectId);

  const user = session?.user;
  const workspace = await getWorkspaceInfo(projectDetails.workspaceId);
  const projects = await getProjectsByWorkspace(projectDetails.workspaceId);
  const showBanner =
    isFeatureEnabled(Feature.WORKSPACE) &&
    projectDetails.isFreeTier &&
    projectDetails.gbLimit > 0 &&
    projectDetails.gbUsedThisMonth >= 0.8 * projectDetails.gbLimit;

  const posthog = PostHogClient();

  if (posthog) {
    posthog.identify({ distinctId: user.email ?? "" });
  }

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get(projectSidebarCookieName)
    ? cookieStore.get(projectSidebarCookieName)?.value === "true"
    : true;

  return (
    <UserContextProvider user={user}>
      <SessionSyncProvider>
        <PostHogIdentifier email={user.email} />
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
      </SessionSyncProvider>
    </UserContextProvider>
  );
}
