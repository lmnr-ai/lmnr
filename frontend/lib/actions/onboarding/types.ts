// Bump when the persisted cookie shape changes incompatibly. Older cookies are
// dropped on read so users aren't trapped by a stale schema.
export const ONBOARDING_COOKIE_VERSION = 2;

export const ONBOARDING_COOKIE_NAME = "onboarding-state";

// Every step after the workspace one; the workspace exists from then on.
export const SAVED_ONBOARDING_STEPS = ["invite", "signals", "slack", "plan", "connect"] as const;
export type SavedOnboardingStep = (typeof SAVED_ONBOARDING_STEPS)[number];

// Invites and signal templates picked before the plan. Applied once a trial or paid plan starts.
export interface OnboardingPending {
  invites: string[];
  templateNames: string[];
}

export interface OnboardingState {
  v: number;
  userId: string;
  workspaceId: string;
  projectId: string;
  step: SavedOnboardingStep;
  startedAt: number;
  pending?: OnboardingPending;
}

export interface CommitOnboardingResult {
  workspaceId: string;
  projectId: string;
  next: "connect" | "checkout";
  checkoutUrl?: string;
  failedInvites: string[];
}

export const MAX_ONBOARDING_INVITES = 20;
