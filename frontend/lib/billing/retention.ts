import { subDays } from "date-fns";

// Single source of truth for retention — display copy, the enforced query
// window, AND the date-picker limit (`ProjectDetails.logRetentionDays`). Edit a
// tier here and every consumer picks up the change. Windows are whole days so
// the day-based picker and the API cutoff always agree.
// `windowDays` null = no enforced window (enterprise / custom).

export type RetentionTier = "free" | "hobby" | "pro" | "enterprise";

export const TIER_RETENTION: Record<
  RetentionTier,
  { duration: string; durationPlural: string; windowDays: number | null }
> = {
  free: { duration: "7 day", durationPlural: "7 days", windowDays: 7 },
  hobby: { duration: "3 month", durationPlural: "3 months", windowDays: 90 },
  pro: { duration: "1 year", durationPlural: "1 year", windowDays: 365 },
  enterprise: { duration: "Custom", durationPlural: "Custom", windowDays: null },
};

export const retentionLabel = (tier: RetentionTier) => `${TIER_RETENTION[tier].duration} data access`;

// Retention window in days for a raw tier name, null = no enforcement. Matches
// the raw tier name directly (not `normalizeTier`, which would fold unknown
// tiers like self-hosted `unlimited` to `free`), except "Starter" — an earlier
// display name DB rows may carry for the internal "hobby" tier.
export const retentionDays = (tierName: string): number | null => {
  const key = tierName.trim().toLowerCase();
  return TIER_RETENTION[(key === "starter" ? "hobby" : key) as RetentionTier]?.windowDays ?? null;
};

// Earliest timestamp a tier may query back to, null = no enforcement.
export const retentionCutoff = (tierName: string, now: Date = new Date()): Date | null => {
  const days = retentionDays(tierName);
  return days === null ? null : subDays(now, days);
};
