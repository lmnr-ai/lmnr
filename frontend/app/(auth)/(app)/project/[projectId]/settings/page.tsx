import { and, eq } from "drizzle-orm";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

import SharedSettings from "@/components/shared-settings";
import { getSubscriptionDetails, getUpcomingInvoice } from "@/lib/actions/checkout";
import { getProjectDetails } from "@/lib/actions/project";
import { getApiKeys } from "@/lib/actions/project-api-keys";
import { getWorkspaceStats } from "@/lib/actions/usage/workspace-stats";
import { getWorkspace } from "@/lib/actions/workspace";
import { requireProjectAccess } from "@/lib/authorization";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const metadata: Metadata = {
  title: "Settings",
};

// Settings renders INSIDE the project layout (so the project sidebar stays visible) and implicitly
// targets this project + its workspace — there are no pickers; section is chosen via ?tab=.
export default async function ProjectSettingsPage(props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;

  // Redirects to /sign-in / notFound() itself.
  const session = await requireProjectAccess(params.projectId);
  const user = session.user;

  const projectDetails = await getProjectDetails(params.projectId);
  const workspaceId = projectDetails.workspaceId;

  const [workspace, apiKeys] = await Promise.all([
    getWorkspace({ workspaceId }),
    getApiKeys({ projectId: params.projectId }),
  ]);

  const userMembership = await db
    .select({ role: membersOfWorkspaces.memberRole })
    .from(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.userId, user.id), eq(membersOfWorkspaces.workspaceId, workspaceId)))
    .limit(1)
    .then((res) => res[0]);

  if (!userMembership) {
    return notFound();
  }

  const isOwner = userMembership.role === "owner";
  const currentUserRole = userMembership.role || "member";

  const workspaceStats = await getWorkspaceStats(workspaceId).catch((e) => {
    console.error("Error fetching workspace stats:", e);
    return null;
  });

  const invitations = await db.query.workspaceInvitations
    .findMany({
      where: eq(workspaceInvitations.workspaceId, workspaceId),
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
        getSubscriptionDetails(workspaceId),
        getUpcomingInvoice(workspaceId),
      ]);
    } catch (error) {
      console.error("Error fetching subscription details:", error);
    }
  }

  return (
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
  );
}
