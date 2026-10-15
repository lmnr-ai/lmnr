import { z } from "zod/v4";

// Bump when the persisted cookie shape changes incompatibly. Older cookies are
// dropped on read so users aren't trapped by a stale schema.
export const ONBOARDING_COOKIE_VERSION = 2 as const;

export const ONBOARDING_COOKIE_NAME = "onboarding-state";

export const ONBOARDING_STEPS = ["workspace", "invite", "signals", "plan", "slack", "connect"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Everything up to "plan" is a browser-side draft; the plan step commits it in one server call.
export const DRAFT_STEPS = ["workspace", "invite", "signals", "plan"] as const satisfies readonly OnboardingStep[];
export type DraftOnboardingStep = (typeof DRAFT_STEPS)[number];

// Steps after the plan commit, the only ones that need a server-side resume point:
// "plan" while a Stripe checkout is open or was cancelled, then Slack, then connect.
export const COMMITTED_STEPS = ["plan", "slack", "connect"] as const satisfies readonly OnboardingStep[];
export type CommittedOnboardingStep = (typeof COMMITTED_STEPS)[number];

export const DEFAULT_SELECTED_TEMPLATE_NAMES = ["Failure Detector"] as const;

export const MAX_ONBOARDING_INVITES = 20;
const MAX_ONBOARDING_TEMPLATES = 50;

// Invites and signal templates picked before the plan. Applied once a trial or paid plan starts;
// kept in the state cookie only across the Stripe checkout redirect.
export const OnboardingPendingSchema = z.object({
  invites: z.array(z.email()).max(MAX_ONBOARDING_INVITES),
  templateNames: z.array(z.string().max(200)).max(MAX_ONBOARDING_TEMPLATES),
});
export type OnboardingPending = z.infer<typeof OnboardingPendingSchema>;

export const OnboardingStateSchema = z.object({
  v: z.literal(ONBOARDING_COOKIE_VERSION),
  userId: z.string(),
  workspaceId: z.string(),
  projectId: z.string(),
  step: z.enum(COMMITTED_STEPS),
  startedAt: z.number(),
  // A malformed optional field drops only itself, not the user's progress.
  pending: OnboardingPendingSchema.optional().catch(undefined),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

// Pre-commit answers, saved on every step change through /api/onboarding/draft and read by the
// onboarding page so a refresh or a closed tab resumes on the same step.
export const ONBOARDING_DRAFT_COOKIE_NAME = "onboarding-draft";
export const ONBOARDING_DRAFT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export const OnboardingDraftInputSchema = OnboardingPendingSchema.extend({
  step: z.enum(DRAFT_STEPS),
  workspaceName: z.string().max(200),
  projectName: z.string().max(200),
});
export const OnboardingDraftSchema = OnboardingDraftInputSchema.extend({ userId: z.string() });
export type OnboardingDraft = z.infer<typeof OnboardingDraftSchema>;

export interface CommitOnboardingResult {
  workspaceId: string;
  projectId: string;
  next: "slack" | "connect" | "checkout";
  checkoutUrl?: string;
  failedInvites: string[];
}
