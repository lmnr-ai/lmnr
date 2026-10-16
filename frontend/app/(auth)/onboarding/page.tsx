import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import OnboardingWizard, { type OnboardingInitialValues } from "@/components/onboarding";
import AwaitCompanyName from "@/components/onboarding/await-company-name";
import OnboardingLoading from "@/components/onboarding/onboarding-loading";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { UserContextProvider } from "@/contexts/user-context";
import { isStarterTrialEligible } from "@/lib/actions/checkout/trial";
import { getOnboardingState } from "@/lib/actions/onboarding";
import { getCachedCompanyName } from "@/lib/actions/onboarding/company-name";
import { resolveResume } from "@/lib/actions/onboarding/resolve-resume";
import { loadOnboardingResumeDefaults, type OnboardingResumeDefaults } from "@/lib/actions/onboarding/resume-defaults";
import { DEFAULT_SELECTED_TEMPLATE_NAMES, type OnboardingPending } from "@/lib/actions/onboarding/types";
import { countWorkspaceMemberships } from "@/lib/actions/workspace/utils";
import { getServerSession } from "@/lib/auth-session";
import { orgDomainFromEmail } from "@/lib/email-domain";
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
  invites: [],
  selectedTemplateNames: [...DEFAULT_SELECTED_TEMPLATE_NAMES],
  slackConnected: false,
  selectedTier: "free",
  currentTier: "free",
};

function buildDefaults(
  resumeDefaults: OnboardingResumeDefaults | null,
  pending: OnboardingPending | undefined,
  companyName: string | null
): OnboardingFormValues {
  if (resumeDefaults) {
    return {
      ...EMPTY_DEFAULTS,
      workspaceName: resumeDefaults.workspaceName ?? EMPTY_DEFAULTS.workspaceName,
      invites: pending?.invites ?? [],
      selectedTemplateNames: pending?.templateNames ?? resumeDefaults.selectedTemplateNames,
      slackConnected: resumeDefaults.slackConnected,
      selectedTier: resumeDefaults.selectedTier,
      currentTier: resumeDefaults.selectedTier,
    };
  }
  return { ...EMPTY_DEFAULTS, workspaceName: companyName ?? "" };
}

// Starter is preselected while its free trial is on offer; a workspace already past Free keeps its tier.
const preselectTrial = (values: OnboardingFormValues, trialAvailable: boolean): OnboardingFormValues =>
  trialAvailable && values.currentTier === "free" ? { ...values, selectedTier: "hobby" } : values;

export default async function OnboardingPage(props: OnboardingPageProps) {
  const session = await getServerSession();
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

  // Onboarding keeps the cookie from step 1, so a Slack return without one (finished in another tab)
  // goes to the app instead of a wizard whose first step would create another workspace.
  const returningFromSlack = searchParams?.slack !== undefined;
  if (workspaceCount > 0 && !resume.inProgress) {
    return redirect("/projects");
  }

  const orgDomain = orgDomainFromEmail(user.email);
  const lookupDomain = orgDomain && isFeatureEnabled(Feature.ONBOARDING_COMPANY_NAME) ? orgDomain : null;
  const [resumeDefaults, cachedName, trialAvailable] = await Promise.all([
    resume.point
      ? loadOnboardingResumeDefaults({
          workspaceId: resume.point.workspaceId,
          projectId: resume.point.projectId,
        })
      : null,
    lookupDomain ? getCachedCompanyName(lookupDomain) : undefined,
    isStarterTrialEligible(resume.point?.workspaceId ?? null, user.id),
  ]);

  const renderWizard = (companyName: string | null) => {
    const initial: OnboardingInitialValues = {
      workspaceId: resume.point?.workspaceId ?? null,
      projectId: resume.point?.projectId ?? null,
      // The Slack OAuth return lands back on the Slack step even if its progress save lost the race.
      step:
        returningFromSlack && resume.point && resume.point.step !== "connect"
          ? "slack"
          : (resume.point?.step ?? "workspace"),
      defaultValues: preselectTrial(buildDefaults(resumeDefaults, resume.point?.pending, companyName), trialAvailable),
      companyName,
      trialAvailable,
    };
    return (
      <OnboardingWizard
        initial={initial}
        slackClientId={process.env.SLACK_CLIENT_ID}
        slackRedirectUri={process.env.SLACK_REDIRECT_URL}
      />
    );
  };

  // Cached name: render at once. First visit for a domain: stream a loading step while the LLM answers.
  const content =
    lookupDomain && !resume.point && !cachedName ? (
      <Suspense fallback={<OnboardingLoading />}>
        <AwaitCompanyName domain={lookupDomain}>{renderWizard}</AwaitCompanyName>
      </Suspense>
    ) : (
      renderWizard(cachedName?.name ?? null)
    );

  return (
    <UserContextProvider user={user}>
      <div className="flex flex-col min-h-screen w-full bg-surface-150">{content}</div>
    </UserContextProvider>
  );
}
