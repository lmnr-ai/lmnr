import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import OnboardingWizard, { type OnboardingInitialValues } from "@/components/onboarding";
import { DEFAULT_SELECTED_TEMPLATE_NAMES, type OnboardingFormValues } from "@/components/onboarding/types";
import { UserContextProvider } from "@/contexts/user-context";
import { getOnboardingState } from "@/lib/actions/onboarding";
import { resolveResume } from "@/lib/actions/onboarding/resolve-resume";
import { loadOnboardingResumeDefaults, type OnboardingResumeDefaults } from "@/lib/actions/onboarding/resume-defaults";
import { countWorkspaceMemberships } from "@/lib/actions/workspace/utils";
import { authOptions } from "@/lib/auth";
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
  slackConnected: false,
  selectedTier: "free",
  currentTier: "free",
};

function buildDefaults(resumeDefaults: OnboardingResumeDefaults | null): OnboardingFormValues {
  if (!resumeDefaults) return EMPTY_DEFAULTS;
  return {
    ...EMPTY_DEFAULTS,
    workspaceName: resumeDefaults.workspaceName ?? EMPTY_DEFAULTS.workspaceName,
    selectedTemplateNames: resumeDefaults.selectedTemplateNames,
    slackConnected: resumeDefaults.slackConnected,
    selectedTier: resumeDefaults.selectedTier,
    currentTier: resumeDefaults.selectedTier,
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

  // OSS never writes the cookie — any cookie here is from the old multi-step build.
  if (!isFeatureEnabled(Feature.LAMINAR_CLOUD) && saved && saved.userId === user.id) {
    return redirect("/api/onboarding?to=/projects");
  }

  if (resume.stale && workspaceCount > 0) {
    return redirect("/api/onboarding?to=/projects");
  }

  const returningFromSlack = searchParams?.slack !== undefined;
  // Stripe lands here with ?upgraded=true; let PaidFinalize own the DELETE + nav.
  const returningFromStripe = searchParams?.upgraded === "true";
  if (workspaceCount > 0 && !resume.inProgress && !returningFromSlack && !returningFromStripe) {
    return redirect("/projects");
  }

  const resumeDefaults = resume.point
    ? await loadOnboardingResumeDefaults({
        workspaceId: resume.point.workspaceId,
        projectId: resume.point.projectId,
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
