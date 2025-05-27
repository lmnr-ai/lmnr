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
import SQLEditorProvider from "@/components/sql/context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ProjectContextProvider } from "@/contexts/project-context";
import { UserContextProvider } from "@/contexts/user-context";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces, workspaceUsage } from "@/lib/db/migrations/schema";
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

  const usageResult = await db
    .select({
      spanCountSinceReset: workspaceUsage.spanCountSinceReset,
      stepCountSinceReset: workspaceUsage.stepCountSinceReset,
    })
    .from(workspaceUsage)
    .where(eq(workspaceUsage.workspaceId, project.workspaceId))
    .limit(1);

  const usage = usageResult.length > 0 ? usageResult[0] : { spanCountSinceReset: 0, stepCountSinceReset: 0 };

  const tierResult = await db
    .select({
      name: subscriptionTiers.name,
      spansLimit: subscriptionTiers.spans,
      stepsLimit: subscriptionTiers.steps,
    })
    .from(subscriptionTiers)
    .where(eq(subscriptionTiers.id, workspace.tierId))
    .limit(1);

  if (tierResult.length === 0) {
    throw new Error("Subscription tier not found for workspace");
  }
  const tier = tierResult[0];

  return {
    id: project.id,
    name: project.name,
    workspaceId: project.workspaceId,
    spansThisMonth: Number(usage.spanCountSinceReset),
    spansLimit: Number(tier.spansLimit),
    agentStepsThisMonth: Number(usage.stepCountSinceReset),
    agentStepsLimit: Number(tier.stepsLimit),
    isFreeTier: tier.name.toLowerCase().trim() === "free",
    eventsThisMonth: 0,
    eventsLimit: 0,
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
  const showBanner =
    isFeatureEnabled(Feature.WORKSPACE) &&
    project.isFreeTier &&
    ((project.spansLimit > 0 && project.spansThisMonth >= 0.8 * project.spansLimit) ||
      (project.agentStepsLimit > 0 && project.agentStepsThisMonth >= 0.8 * project.agentStepsLimit));

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
                  agentStepsThisMonth={project.agentStepsThisMonth}
                  agentStepsLimit={project.agentStepsLimit}
                />
              )}
              <SQLEditorProvider>{children}</SQLEditorProvider>
            </SidebarInset>
          </SidebarProvider>
        </div>
      </ProjectContextProvider>
    </UserContextProvider>
  );
}
