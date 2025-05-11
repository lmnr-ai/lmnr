import "@/app/globals.css";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import PostHogClient from "@/app/posthog";
import ProjectNavbar from "@/components/project/project-navbar";
import ProjectUsageBanner from "@/components/project/usage-banner";
import { SidebarProvider } from "@/components/ui/sidebar";
import { ProjectContextProvider } from "@/contexts/project-context";
import { UserContextProvider } from "@/contexts/user-context";
import { authOptions } from "@/lib/auth";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { fetcherJSON } from "@/lib/utils";
import { GetProjectResponse } from "@/lib/workspaces/types";

export default async function ProjectIdLayout(props: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
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
            <div className="z-50 h-screen">
              <ProjectNavbar workspaceId={project.workspaceId} isFreeTier={project.isFreeTier} projectId={projectId} />
            </div>
            <div className="flex flex-col max-w-[calc(100%_-_175px)] w-full h-screen flex-1">
              {showBanner && (
                <ProjectUsageBanner
                  workspaceId={project.workspaceId}
                  spansThisMonth={project.spansThisMonth}
                  spansLimit={project.spansLimit}
                />
              )}
              <div className="z-10 flex flex-col flex-grow">{children}</div>
            </div>
          </SidebarProvider>
        </div>
      </ProjectContextProvider>
    </UserContextProvider>
  );
}
