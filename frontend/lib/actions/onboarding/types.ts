// Bump when the persisted cookie shape changes incompatibly. Older cookies are
// dropped on read so users aren't trapped by a stale schema.
export const ONBOARDING_COOKIE_VERSION = 2;

export const ONBOARDING_COOKIE_NAME = "onboarding-state";

// Steps after the plan commit, the only ones that need a server-side resume point:
// "plan" while a Stripe checkout is open or was cancelled, then Slack, then connect.
export type CommittedOnboardingStep = "plan" | "slack" | "connect";

// Invites and signal templates picked before the plan. Applied once a trial or paid plan starts;
// kept here only across the Stripe checkout redirect.
export interface OnboardingPending {
  invites: string[];
  templateNames: string[];
}

export interface OnboardingState {
  v: number;
  userId: string;
  workspaceId: string;
  projectId: string;
  step: CommittedOnboardingStep;
  startedAt: number;
  pending?: OnboardingPending;
}

export interface CommitOnboardingResult {
  workspaceId: string;
  projectId: string;
  next: "slack" | "connect" | "checkout";
  checkoutUrl?: string;
  failedInvites: string[];
}

// Pre-commit answers, saved on every step change through /api/onboarding/draft and read by the
// onboarding page so a refresh or a closed tab resumes on the same step.
export const ONBOARDING_DRAFT_COOKIE_NAME = "onboarding-draft";
export const ONBOARDING_DRAFT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
export const MAX_ONBOARDING_INVITES = 20;

export type DraftOnboardingStep = "workspace" | "invite" | "signals" | "plan";

export interface OnboardingDraft {
  userId: string;
  step: DraftOnboardingStep;
  workspaceName: string;
  projectName: string;
  invites: string[];
  templateNames: string[];
}
