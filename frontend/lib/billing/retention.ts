import { subDays, subMonths } from "date-fns";

// Single source of truth for retention — display copy AND the enforced query
// window. Edit a tier here and every consumer picks up the change.
// `window` null = no enforced window (enterprise / custom).

export type RetentionTier = "free" | "hobby" | "pro" | "enterprise";

type RetentionWindow = { unit: "day" | "month"; value: number };

export const TIER_RETENTION: Record<
  RetentionTier,
  { duration: string; durationPlural: string; window: RetentionWindow | null }
> = {
  free: { duration: "7 day", durationPlural: "7 days", window: { unit: "day", value: 7 } },
  hobby: { duration: "30 day", durationPlural: "30 days", window: { unit: "day", value: 30 } },
  pro: { duration: "6 month", durationPlural: "6 months", window: { unit: "month", value: 6 } },
  enterprise: { duration: "Custom", durationPlural: "Custom", window: null },
};

export const retentionLabel = (tier: RetentionTier) => `${TIER_RETENTION[tier].duration} retention`;

// Earliest timestamp a tier may query back to, null = no enforcement. Matches
// the raw tier name directly (not `normalizeTier`, which would fold unknown
// tiers like self-hosted `unlimited` to `free`).
export const retentionCutoff = (tierName: string, now: Date = new Date()): Date | null => {
  const window = TIER_RETENTION[tierName.trim().toLowerCase() as RetentionTier]?.window;
  if (!window) {
    return null;
  }
  return window.unit === "month" ? subMonths(now, window.value) : subDays(now, window.value);
};
