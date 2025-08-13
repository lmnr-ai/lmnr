import "@/app/globals.css";

import { eq } from "drizzle-orm";
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
import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { getWorkspaceInfo, getWorkspaceUsage } from "@/lib/actions/workspace";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { GetProjectResponse } from "@/lib/workspaces/types";

async function getProjectDetails(projectId: string): Promise<GetProjectResponse> {
  const projectResult = await db
    .select({
      id: projects.id,
      name: projects.name,
      workspaceId: projects.workspaceId,
    })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (projectResult.length === 0) {
    throw new Error("Project not found");
  }
  const project = projectResult[0];

  const workspaceResult = await db
    .select({
      id: workspaces.id,
      tierId: workspaces.tierId,
    })
    .from(workspaces)
    .where(eq(workspaces.id, project.workspaceId))
    .limit(1);

  if (workspaceResult.length === 0) {
    throw new Error("Workspace not found for project");
  }
  const workspace = workspaceResult[0];
  const usageResult = await getWorkspaceUsage(project.workspaceId);

  const tierResult = await db
    .select({
      name: subscriptionTiers.name,
      stepsLimit: subscriptionTiers.steps,
      bytesLimit: subscriptionTiers.bytesIngested,
    })
    .from(subscriptionTiers)
    .where(eq(subscriptionTiers.id, workspace.tierId))
    .limit(1);

  if (tierResult.length === 0) {
    throw new Error("Subscription tier not found for workspace");
  }
  const tier = tierResult[0];

  // Convert bytes to GB (1 GB = 1024^3 bytes)
  const bytesToGB = (bytes: number): number => bytes / (1024 * 1024 * 1024);

  const gbUsedThisMonth = bytesToGB(
    Number(
      usageResult.spansBytesIngested + usageResult.browserSessionEventsBytesIngested + usageResult.eventsBytesIngested
    )
  );
  const gbLimit = bytesToGB(Number(tier.bytesLimit));

  return {
    id: project.id,
    name: project.name,
    workspaceId: project.workspaceId,
    gbUsedThisMonth,
    gbLimit,
    isFreeTier: tier.name.toLowerCase().trim() === "free",
  };
}

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
