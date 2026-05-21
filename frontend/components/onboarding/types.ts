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

export const ONBOARDING_STEPS = ["workspace", "signals", "slack", "plan"] as const;

export const DEFAULT_SELECTED_TEMPLATE_NAMES = ["Failure Detector"] as const;

export const TIER_RANK: Record<OnboardingTier, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
};
