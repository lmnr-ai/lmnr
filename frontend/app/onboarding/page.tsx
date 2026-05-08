import { and, eq, sql } from "drizzle-orm";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import OnboardingWizard, { type OnboardingInitialValues } from "@/components/onboarding";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { UserContextProvider } from "@/contexts/user-context";
import { getOnboardingState } from "@/lib/actions/onboarding";
import { hydrateOnboardingValues } from "@/lib/actions/onboarding/hydrate";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Get Started - Laminar",
  description: "Set up your workspace and start tracing your AI agents.",
};

interface OnboardingPageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

const EMPTY_DEFAULTS: OnboardingFormValues = {
  workspaceName: "",
  projectName: "",
  selectedSignalIds: ["Failure Detector"],
  emailNotificationsEnabled: true,
  slackConnected: false,
  selectedTier: "free",
};

export default async function OnboardingPage(props: OnboardingPageProps) {
  const searchParams = await props.searchParams;
  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in?callbackUrl=/onboarding");
  }
  const user = session.user;

  // Try to resume a previously-started onboarding flow (e.g. user went to Slack OAuth
  // or Stripe checkout and came back). The cookie stores the workspace/project they
  // created and the step they reached, so we can drop them right back in. We only
  // READ the cookie here — Server Components can't reliably write cookies in Next.js,
  // so the wizard manages all cookie writes (set/clear) via /api/onboarding/state.
  const saved = await getOnboardingState();
  let resumeWorkspaceId: string | null = null;
  let resumeProjectId: string | null = null;
  let resumeStep = 0;

  if (saved && saved.userId === user.id && saved.workspaceId && saved.projectId) {
    const owned = await db
      .select({ id: projects.id })
      .from(projects)
      .innerJoin(membersOfWorkspaces, eq(projects.workspaceId, membersOfWorkspaces.workspaceId))
      .where(
        and(
          eq(membersOfWorkspaces.userId, user.id),
          eq(projects.id, saved.projectId),
          eq(projects.workspaceId, saved.workspaceId)
        )
      )
      .limit(1);
    if (owned.length > 0) {
      resumeWorkspaceId = saved.workspaceId;
      resumeProjectId = saved.projectId;
      resumeStep = Math.max(0, saved.step);
    }
  }

  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, user.id));

  const slackReturn = searchParams?.slack;
  // If the user already has workspaces AND there's no in-progress cookie AND they
  // aren't returning from Slack OAuth, respect the legacy redirect to /projects.
  // When a cookie IS present, render the wizard so its mount-effect can refresh
  // the cookie with the current session before any further navigation.
  if (count > 0 && !saved && slackReturn === undefined) {
    return redirect("/projects");
  }

  const hydrated =
    resumeWorkspaceId && resumeProjectId
      ? await hydrateOnboardingValues({
          workspaceId: resumeWorkspaceId,
          projectId: resumeProjectId,
          userEmail: user.email ?? null,
        })
      : null;

  const initial: OnboardingInitialValues = {
    workspaceId: resumeWorkspaceId,
    projectId: resumeProjectId,
    step: resumeStep,
    defaultValues: hydrated
      ? {
          ...EMPTY_DEFAULTS,
          // Hydrated selection wins over the "Failure Detector" default so unchecking
          // it on a previous visit isn't silently re-checked when the user resumes.
          selectedSignalIds: hydrated.selectedSignalIds,
          emailNotificationsEnabled: hydrated.emailNotificationsEnabled,
          slackConnected: hydrated.slackConnected,
          selectedTier: hydrated.selectedTier,
        }
      : EMPTY_DEFAULTS,
  };

  return (
    <UserContextProvider user={user}>
      <div className="flex flex-col min-h-screen w-full bg-background">
        <OnboardingWizard
          initial={initial}
          slackClientId={process.env.SLACK_CLIENT_ID}
          slackRedirectUri={process.env.SLACK_REDIRECT_URL}
        />
      </div>
    </UserContextProvider>
  );
}
