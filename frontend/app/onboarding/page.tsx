import { and, eq, sql } from "drizzle-orm";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import OnboardingWizard from "@/components/onboarding/onboarding-wizard";
import { UserContextProvider } from "@/contexts/user-context";
import { clearOnboardingState, getOnboardingState } from "@/lib/actions/onboarding";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export const metadata: Metadata = {
  title: "Get Started - Laminar",
  description: "Set up your workspace and start tracing your AI agents.",
};

interface OnboardingPageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function OnboardingPage(props: OnboardingPageProps) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in?callbackUrl=/onboarding");
  }

  // Try to resume a previously-started onboarding flow (e.g. user went to Slack OAuth
  // or Stripe checkout and came back). The cookie stores the workspace/project they
  // created and the step they reached, so we can drop them right back in.
  const saved = await getOnboardingState();
  let resumeState: { workspaceId: string; projectId: string; step: number } | null = null;

  if (saved) {
    const owned = await db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(membersOfWorkspaces, eq(projects.workspaceId, membersOfWorkspaces.workspaceId))
      .where(
        and(
          eq(membersOfWorkspaces.userId, session.user.id),
          eq(projects.id, saved.projectId),
          eq(projects.workspaceId, saved.workspaceId)
        )
      )
      .limit(1);
    if (owned.length > 0) {
      resumeState = saved;
    } else {
      // Stale cookie — workspace/project no longer accessible, wipe it.
      await clearOnboardingState();
    }
  }

  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, session.user.id));

  const slackReturn = searchParams?.slack;
  // If the user already has workspaces AND we're not mid-onboarding (no resume cookie
  // or returning from Slack), respect the legacy redirect to /projects.
  if (count > 0 && !resumeState && slackReturn === undefined) {
    return redirect("/projects");
  }

  const user = session.user;

  return (
    <UserContextProvider user={user}>
      <div className="flex flex-col min-h-screen w-full bg-background">
        <OnboardingWizard
          userName={user.name}
          userEmail={user.email}
          slackClientId={process.env.SLACK_CLIENT_ID}
          slackRedirectUri={process.env.SLACK_REDIRECT_URL}
          slackFeatureEnabled={isFeatureEnabled(Feature.SLACK)}
          subscriptionEnabled={isFeatureEnabled(Feature.SUBSCRIPTION)}
          resumeState={resumeState}
        />
      </div>
    </UserContextProvider>
  );
}
