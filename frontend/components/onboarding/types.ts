import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/actions/onboarding/types";

export type OnboardingTier = "free" | "hobby" | "pro";

export interface OnboardingFormValues {
  workspaceName: string;
  projectName: string;
  // Queued until the plan commit; dropped if the user stays on Free.
  invites: string[];
  selectedTemplateNames: string[];
  slackConnected: boolean;
  selectedTier: OnboardingTier;
  // Workspace's actual tier at hydration; never mutated by the user.
  currentTier: OnboardingTier;
}

// Slack needs a paid plan or trial (and connects immediately via OAuth), so Free skips it.
const FREE_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS.filter((step) => step !== "slack");
export const visibleOnboardingSteps = (isPaid: boolean): readonly OnboardingStep[] =>
  isPaid ? ONBOARDING_STEPS : FREE_STEPS;
