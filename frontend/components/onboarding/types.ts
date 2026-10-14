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

// Everything up to "plan" is a browser-side draft; the plan step commits it in one server call.
export const ONBOARDING_STEPS = ["workspace", "invite", "signals", "plan", "slack", "connect"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const DRAFT_STEPS: readonly OnboardingStep[] = ["workspace", "invite", "signals", "plan"];

// Slack needs a paid plan or trial (and connects immediately via OAuth), so Free skips it.
const FREE_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS.filter((step) => step !== "slack");
export const visibleOnboardingSteps = (isPaid: boolean): readonly OnboardingStep[] =>
  isPaid ? ONBOARDING_STEPS : FREE_STEPS;

export const DEFAULT_SELECTED_TEMPLATE_NAMES = ["Failure Detector"] as const;

export const TIER_RANK: Record<OnboardingTier, number> = {
  free: 0,
  hobby: 1,
  pro: 2,
};
