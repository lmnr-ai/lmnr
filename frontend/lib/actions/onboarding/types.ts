import { z } from "zod/v4";

// Bump when the persisted cookie shape changes incompatibly. Older cookies are
// dropped on read so users aren't trapped by a stale schema.
export const ONBOARDING_COOKIE_VERSION = 2 as const;

export const ONBOARDING_COOKIE_NAME = "onboarding-state";

// The workspace step creates the workspace; the plan step applies the queued invites and signals.
export const ONBOARDING_STEPS = ["workspace", "invite", "signals", "slack", "plan", "connect"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

// Every step after the workspace one; the workspace exists from then on.
export const SAVED_ONBOARDING_STEPS = [
  "invite",
  "signals",
  "slack",
  "plan",
  "connect",
] as const satisfies readonly OnboardingStep[];
export type SavedOnboardingStep = (typeof SAVED_ONBOARDING_STEPS)[number];

// Saved by the wizard on entry; the plan commit saves "connect" itself.
export const PROGRESS_STEPS = ["invite", "signals", "slack", "plan"] as const satisfies readonly SavedOnboardingStep[];

export const DEFAULT_SELECTED_TEMPLATE_NAMES = ["Failure Detector"] as const;

export const MAX_ONBOARDING_INVITES = 20;
const MAX_ONBOARDING_TEMPLATES = 50;

// Invites and signal templates picked before the plan. Applied once a trial or paid plan starts.
export const OnboardingPendingSchema = z.object({
  invites: z.array(z.email()).max(MAX_ONBOARDING_INVITES),
  templateNames: z.array(z.string().max(200)).max(MAX_ONBOARDING_TEMPLATES),
});
export type OnboardingPending = z.infer<typeof OnboardingPendingSchema>;

export const OnboardingProgressSchema = z.object({
  step: z.enum(PROGRESS_STEPS),
  pending: OnboardingPendingSchema,
});

export const OnboardingStateSchema = z.object({
  v: z.literal(ONBOARDING_COOKIE_VERSION),
  userId: z.string(),
  workspaceId: z.string(),
  projectId: z.string(),
  step: z.enum(SAVED_ONBOARDING_STEPS),
  startedAt: z.number(),
  // A malformed optional field drops only itself, not the user's progress.
  pending: OnboardingPendingSchema.optional().catch(undefined),
});
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export interface CommitOnboardingResult {
  workspaceId: string;
  projectId: string;
  next: "connect" | "checkout";
  checkoutUrl?: string;
  failedInvites: string[];
}
