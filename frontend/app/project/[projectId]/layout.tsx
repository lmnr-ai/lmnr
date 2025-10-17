import "@/app/globals.css";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ReactNode } from "react";

import PostHogClient from "@/app/posthog";
import PostHogIdentifier from "@/app/posthog-identifier";
import ProjectSidebar from "@/components/project/project-sidebar";
import ProjectUsageBanner from "@/components/project/usage-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProjectContextProvider } from "@/contexts/project-context";
import { UserContextProvider } from "@/contexts/user-context";
import { getProjectDetails } from "@/lib/actions/project";
import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { getWorkspaceInfo } from "@/lib/actions/workspace";
import { authOptions } from "@/lib/auth";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function ProjectIdLayout(props: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  const { children } = props;

  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in");
  }
  const user = session.user;

  const project = await getProjectDetails(projectId);
  const workspace = await getWorkspaceInfo(project.workspaceId);
  const projects = await getProjectsByWorkspace(project.workspaceId);
  const showBanner =
    isFeatureEnabled(Feature.WORKSPACE) &&
    project.isFreeTier &&
    project.gbLimit > 0 &&
    project.gbUsedThisMonth >= 0.8 * project.gbLimit;

  const posthog = PostHogClient();
  posthog.identify({
    distinctId: user.email ?? "",
  });

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar:state") ? cookieStore.get("sidebar:state")?.value === "true" : true;

  return (
    <UserContextProvider
      id={user.id}
      email={user.email!}
      username={user.name!}
      imageUrl={user.image!}
      supabaseAccessToken={session.supabaseAccessToken}
    >
      <PostHogIdentifier email={user.email!} />
      <ProjectContextProvider workspace={workspace} projects={projects} project={project}>
        <div className="flex flex-row flex-1 overflow-hidden max-h-screen">
          <SidebarProvider defaultOpen={defaultOpen}>
            <ProjectSidebar
              workspaceId={project.workspaceId}
              isFreeTier={project.isFreeTier}
              projectId={projectId}
              gbUsedThisMonth={project.gbUsedThisMonth}
              gbLimit={project.gbLimit}
            />
            <SidebarInset className="overflow-hidden">
              {showBanner && (
                <ProjectUsageBanner
                  workspaceId={project.workspaceId}
                  gbUsedThisMonth={project.gbUsedThisMonth}
                  gbLimit={project.gbLimit}
                />
              )}
              {children}
            </SidebarInset>
          </SidebarProvider>
        </div>
      </ProjectContextProvider>
    </UserContextProvider>
  );
}
