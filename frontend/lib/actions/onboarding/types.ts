// Bump when the persisted cookie shape changes incompatibly. Older cookies are
// dropped on read so users aren't trapped by a stale schema.
export const ONBOARDING_COOKIE_VERSION = 1;

export const ONBOARDING_COOKIE_NAME = "onboarding-state";

export interface OnboardingState {
  v: number;
  userId: string;
  workspaceId: string | null;
  projectId: string | null;
  step: number;
  startedAt: number;
}
