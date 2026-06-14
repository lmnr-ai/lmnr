import { and, eq } from "drizzle-orm";
import { type Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import WorkspaceGroupTracker from "@/components/common/workspace-group-tracker";
import SharedSettings from "@/components/shared-settings";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import WorkspaceMenuProvider from "@/components/workspace/workspace-menu-provider.tsx";
import { ProjectContextProvider } from "@/contexts/project-context";
import { UserContextProvider } from "@/contexts/user-context";
import { getSubscriptionDetails, getUpcomingInvoice } from "@/lib/actions/checkout";
import { getProjectDetails } from "@/lib/actions/project";
import { getApiKeys } from "@/lib/actions/project-api-keys";
import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { getWorkspaceStats } from "@/lib/actions/usage/workspace-stats";
import { getWorkspace } from "@/lib/actions/workspace";
import { requireProjectAccess } from "@/lib/authorization";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage(props: {
  params: Promise<{ workspaceId: string; projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

  // Project access implies workspace access; redirects to /sign-in / notFound() itself.
  const session = await requireProjectAccess(params.projectId);
  const user = session.user;

  const projectDetails = await getProjectDetails(params.projectId);
  // The route's workspaceId must match the project's actual workspace. Preserve
  // the original query string (section + any deep-link params) on the bounce.
  if (projectDetails.workspaceId !== params.workspaceId) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v) => query.append(key, v));
      } else {
        query.append(key, value);
      }
    }
    if (!query.has("section")) {
      query.set("section", "general");
    }
    return redirect(`/settings/${projectDetails.workspaceId}/${params.projectId}?${query.toString()}`);
  }

  const [workspace, apiKeys, projects] = await Promise.all([
    getWorkspace({ workspaceId: params.workspaceId }),
    getApiKeys({ projectId: params.projectId }),
    getProjectsByWorkspace(params.workspaceId),
  ]);

  const userMembership = await db
    .select({ role: membersOfWorkspaces.memberRole })
    .from(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.userId, user.id), eq(membersOfWorkspaces.workspaceId, params.workspaceId)))
    .limit(1)
    .then((res) => res[0]);

  if (!userMembership) {
    return notFound();
  }

  const isOwner = userMembership.role === "owner";
  const currentUserRole = userMembership.role || "member";

  const workspaceStats = await getWorkspaceStats(params.workspaceId).catch((e) => {
    console.error("Error fetching workspace stats:", e);
    return null;
  });

  const invitations = await db.query.workspaceInvitations
    .findMany({
      where: eq(workspaceInvitations.workspaceId, params.workspaceId),
    })
    .catch((e) => {
      console.error("Error fetching invitations:", e);
      return [];
    });

  const canManageBilling = isFeatureEnabled(Feature.SUBSCRIPTION) && ["owner", "admin"].includes(currentUserRole);

  const isPaidTier = workspace.tierName !== "Free";
  let subscription = null;
  let upcomingInvoice = null;

  if (canManageBilling && isPaidTier) {
    try {
      [subscription, upcomingInvoice] = await Promise.all([
        getSubscriptionDetails(params.workspaceId),
        getUpcomingInvoice(params.workspaceId),
      ]);
    } catch (error) {
      console.error("Error fetching subscription details:", error);
    }
  }

  return (
    <UserContextProvider user={user}>
      <ProjectContextProvider workspace={workspace} projects={projects} project={projectDetails}>
        <WorkspaceMenuProvider>
          <WorkspaceGroupTracker workspaceId={workspace.id} workspaceName={workspace.name} />
          <div className="fixed inset-0 flex overflow-hidden md:pt-2 bg-sidebar">
            <SidebarProvider className="bg-sidebar">
              <SidebarInset className="flex flex-col flex-1 md:rounded-tl-lg border h-full overflow-hidden">
                <SharedSettings
                  workspace={workspace}
                  projectId={params.projectId}
                  apiKeys={apiKeys}
                  invitations={invitations}
                  workspaceStats={workspaceStats}
                  isOwner={isOwner}
                  currentUserRole={currentUserRole}
                  subscription={subscription}
                  upcomingInvoice={upcomingInvoice}
                  canManageBilling={canManageBilling}
                  slackClientId={process.env.SLACK_CLIENT_ID}
                  slackRedirectUri={process.env.SLACK_REDIRECT_URL}
                  slackBrokerEnabled={!!process.env.SLACK_BROKER_URL && !!process.env.LMNR_LICENSE_KEY}
                />
              </SidebarInset>
            </SidebarProvider>
          </div>
        </WorkspaceMenuProvider>
      </ProjectContextProvider>
    </UserContextProvider>
  );
}
