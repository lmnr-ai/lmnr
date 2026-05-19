import { and, eq, sql } from "drizzle-orm";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import OnboardingWizard, { type OnboardingInitialValues } from "@/components/onboarding";
import {
  DEFAULT_SELECTED_TEMPLATE_NAMES,
  ONBOARDING_STEPS,
  type OnboardingFormValues,
} from "@/components/onboarding/types";
import { UserContextProvider } from "@/contexts/user-context";
import { getOnboardingState } from "@/lib/actions/onboarding";
import { loadOnboardingResumeDefaults, type OnboardingResumeDefaults } from "@/lib/actions/onboarding/resume-defaults";
import { type OnboardingState } from "@/lib/actions/onboarding/types";
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

const EMPTY_DEFAULTS: OnboardingFormValues = {
  workspaceName: "",
  projectName: "",
  selectedTemplateNames: [...DEFAULT_SELECTED_TEMPLATE_NAMES],
  subscribedReportIds: [],
  slackConnected: false,
  selectedTier: "free",
};

interface ResumeResolution {
  point: { workspaceId: string; projectId: string; step: number } | null;
  // True when an in-progress cookie owned by this user exists, even if it has
  // no resources yet. Suppresses the "user already has workspaces" redirect.
  inProgress: boolean;
  // True when the cookie references a workspace/project the user can no longer access.
  stale: boolean;
}

async function resolveResume(saved: OnboardingState | null, userId: string): Promise<ResumeResolution> {
  if (!saved || saved.userId !== userId) {
    return { point: null, inProgress: false, stale: false };
  }
  if (!saved.workspaceId || !saved.projectId) {
    return { point: null, inProgress: true, stale: false };
  }
  const owned = await db
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(membersOfWorkspaces, eq(projects.workspaceId, membersOfWorkspaces.workspaceId))
    .where(
      and(
        eq(membersOfWorkspaces.userId, userId),
        eq(projects.id, saved.projectId),
        eq(projects.workspaceId, saved.workspaceId)
      )
    )
    .limit(1);
  if (owned.length === 0) {
    return { point: null, inProgress: true, stale: true };
  }
  // Clamp the persisted step against the current step count so an old cookie
  // from a longer wizard (e.g. when "slack" was its own step) still resolves
  // to a valid index after we collapse steps.
  const step = Math.min(Math.max(0, saved.step), ONBOARDING_STEPS.length - 1);
  return {
    point: { workspaceId: saved.workspaceId, projectId: saved.projectId, step },
    inProgress: true,
    stale: false,
  };
}

async function countWorkspaceMemberships(userId: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(membersOfWorkspaces)
    .where(eq(membersOfWorkspaces.userId, userId));
  return count;
}

function buildDefaults(resumeDefaults: OnboardingResumeDefaults | null): OnboardingFormValues {
  if (!resumeDefaults) return EMPTY_DEFAULTS;
  return {
    ...EMPTY_DEFAULTS,
    workspaceName: resumeDefaults.workspaceName ?? EMPTY_DEFAULTS.workspaceName,
    selectedTemplateNames: resumeDefaults.selectedTemplateNames,
    subscribedReportIds: resumeDefaults.subscribedReportIds,
    slackConnected: resumeDefaults.slackConnected,
    selectedTier: resumeDefaults.selectedTier,
  };
}

export default async function OnboardingPage(props: OnboardingPageProps) {
  const session = await getServerSession(authOptions);
  const user = session!.user;

  const searchParams = await props.searchParams;
  const saved = await getOnboardingState();
  const [resume, workspaceCount] = await Promise.all([
    resolveResume(saved, user.id),
    countWorkspaceMemberships(user.id),
  ]);

  // OSS doesn't write resume cookies; a stale one here is from the old multi-step build.
  if (!isFeatureEnabled(Feature.LAMINAR_CLOUD) && saved && saved.userId === user.id) {
    return redirect("/api/onboarding?to=/projects");
  }

  if (resume.stale && workspaceCount > 0) {
    return redirect("/api/onboarding?to=/projects");
  }

  const returningFromSlack = searchParams?.slack !== undefined;
  // Stripe success_url lands here with ?upgraded=true so the wizard's
  // PaidFinalize can run the DELETE-cookie + route-to-project sequence.
  // Suppress the "user already has workspaces" redirect so a transiently
  // cleared cookie can't strand the user on /projects without finalizing.
  const returningFromStripe = searchParams?.upgraded === "true";
  if (workspaceCount > 0 && !resume.inProgress && !returningFromSlack && !returningFromStripe) {
    return redirect("/projects");
  }

  const resumeDefaults = resume.point
    ? await loadOnboardingResumeDefaults({
        workspaceId: resume.point.workspaceId,
        projectId: resume.point.projectId,
        userEmail: user.email ?? null,
      })
    : null;

  const initial: OnboardingInitialValues = {
    workspaceId: resume.point?.workspaceId ?? null,
    projectId: resume.point?.projectId ?? null,
    step: resume.point?.step ?? 0,
    defaultValues: buildDefaults(resumeDefaults),
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
