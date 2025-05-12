import "@/app/globals.css";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ReactNode } from "react";

import PostHogClient from "@/app/posthog";
import ProjectSidebar from "@/components/project/project-sidebar";
import ProjectUsageBanner from "@/components/project/usage-banner";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProjectContextProvider } from "@/contexts/project-context";
import { UserContextProvider } from "@/contexts/user-context";
import { authOptions } from "@/lib/auth";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { fetcherJSON } from "@/lib/utils";
import { GetProjectResponse } from "@/lib/workspaces/types";

export default async function ProjectIdLayout(props: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  const { children } = props;

  const projectId = params.projectId;
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/sign-in");
  }
  const user = session.user;

  const projectResponse = await fetcherJSON(`/projects/${projectId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${user.apiKey}`,
    },
  });

  const project = projectResponse as GetProjectResponse;

  const showBanner =
    isFeatureEnabled(Feature.WORKSPACE) && project.isFreeTier && project.spansThisMonth >= 0.8 * project.spansLimit;

  const posthog = PostHogClient();
  posthog.identify({
    distinctId: user.email ?? "",
  });

  // getting the cookies for the sidebar state
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
      <ProjectContextProvider projectId={project.id} projectName={project.name}>
        <div className="flex flex-row flex-1 overflow-hidden max-h-screen">
          <SidebarProvider defaultOpen={defaultOpen}>
            <ProjectSidebar workspaceId={project.workspaceId} isFreeTier={project.isFreeTier} projectId={projectId} />
            <SidebarInset className="overflow-hidden">
              {showBanner && (
                <ProjectUsageBanner
                  workspaceId={project.workspaceId}
                  spansThisMonth={project.spansThisMonth}
                  spansLimit={project.spansLimit}
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
