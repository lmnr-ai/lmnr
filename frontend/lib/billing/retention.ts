// Single source of truth for retention copy across the landing pricing
// surfaces, the workspace billing tab, the onboarding plan step, and the
// pricing calculator. When a tier's retention window changes, edit it here
// — every consumer picks up the change automatically.
//
// - `duration` is the noun-modifier form, composed with the word "retention"
//   to form a label (e.g. "7 day retention" — see `retentionLabel`).
// - `durationPlural` is the standalone form used in cells where the column
//   header already supplies the noun (e.g. the pricing-table Retention row
//   shows "7 days").

export type RetentionTier = "free" | "hobby" | "pro" | "enterprise";

export const TIER_RETENTION: Record<RetentionTier, { duration: string; durationPlural: string }> = {
  free: { duration: "7 day", durationPlural: "7 days" },
  hobby: { duration: "30 day", durationPlural: "30 days" },
  pro: { duration: "6 month", durationPlural: "6 months" },
  enterprise: { duration: "Custom", durationPlural: "Custom" },
};

export const retentionLabel = (tier: RetentionTier) => `${TIER_RETENTION[tier].duration} retention`;
