export type OnboardingTier = "free" | "hobby" | "pro";

export interface OnboardingFormValues {
  workspaceName: string;
  projectName: string;
  selectedTemplateNames: string[];
  slackConnected: boolean;
  selectedTier: OnboardingTier;
  // Workspace's actual tier at hydration; never mutated by the user.
  currentTier: OnboardingTier;
}

// Persisted (resume cookie) as an index into this list, so only append or keep positions stable.
export const ONBOARDING_STEPS = ["workspace", "plan", "invite", "signals", "slack", "connect"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const stepIndexOf = (step: OnboardingStep): number => ONBOARDING_STEPS.indexOf(step);

// Team, Signals and Slack need a paid plan or trial, so Free skips straight from plan to connect.
const FREE_STEPS: readonly OnboardingStep[] = ["workspace", "plan", "connect"];
export const visibleOnboardingSteps = (isPaid: boolean): readonly OnboardingStep[] =>
  isPaid ? ONBOARDING_STEPS : FREE_STEPS;

export const DEFAULT_SELECTED_TEMPLATE_NAMES = ["Failure Detector"] as const;

export const TIER_RANK: Record<OnboardingTier, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
};
