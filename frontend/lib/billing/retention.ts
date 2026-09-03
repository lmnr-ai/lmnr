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

const normalizeRetentionTier = (tierName: string): RetentionTier | undefined => {
  const key = tierName.trim().toLowerCase();
  const tier = key === "starter" ? "hobby" : key;
  return tier in TIER_RETENTION ? (tier as RetentionTier) : undefined;
};

// Whole-day retention window used for the ClickHouse `expires_at` stamps, null
// = keep forever. Keep in sync with `WorkspaceTierName::retention_days` in
// app-server (`db/projects.rs`): months are counted as 30.5 days (6 → 183).
export const retentionDays = (tierName: string): number | null => {
  const tier = normalizeRetentionTier(tierName);
  const window = tier ? TIER_RETENTION[tier].window : null;
  if (!window) {
    return null;
  }
  return window.unit === "month" ? Math.round(window.value * 30.5) : window.value;
};

// Earliest timestamp a tier may query back to, null = no enforcement. Matches
// the raw tier name directly (not `normalizeTier`, which would fold unknown
// tiers like self-hosted `unlimited` to `free`), except "Starter" — the
// display name DB rows may carry for the internal "hobby" tier.
export const retentionCutoff = (tierName: string, now: Date = new Date()): Date | null => {
  const tier = normalizeRetentionTier(tierName);
  const window = tier ? TIER_RETENTION[tier].window : null;
  if (!window) {
    return null;
  }
  return window.unit === "month" ? subMonths(now, window.value) : subDays(now, window.value);
};
