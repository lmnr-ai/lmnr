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

// The workspace step creates the workspace; the plan step applies the queued invites and signals.
export const ONBOARDING_STEPS = ["workspace", "invite", "signals", "slack", "plan", "connect"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const DEFAULT_SELECTED_TEMPLATE_NAMES = ["Failure Detector"] as const;

export const TIER_RANK: Record<OnboardingTier, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
};
