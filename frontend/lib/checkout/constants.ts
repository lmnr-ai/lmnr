export const TIER_CONFIG = {
  hobby: {
    lookupKey: "hobby_monthly_2026_02",
    overageBytesLookupKey: "hobby_monthly_2026_02_overage_bytes",
    overageSignalRunsLookupKey: "hobby_monthly_2026_02_overage_signal_runs",
    includedBytes: 3 * 1024 ** 3,
    includedSignalRuns: 1_000,
  },
  pro: {
    lookupKey: "pro_monthly_2026_02",
    overageBytesLookupKey: "pro_monthly_2026_02_overage_bytes",
    overageSignalRunsLookupKey: "pro_monthly_2026_02_overage_signal_runs",
    includedBytes: 10 * 1024 ** 3,
    includedSignalRuns: 10_000,
  },
} as const;

export type PaidTier = keyof typeof TIER_CONFIG;
export const DATAPLANE_ADDON_LOOKUP_KEY = "pro_monthly_2026_02_addon_dataplane";

/**
 * Defines every purchasable addon and which tiers are eligible to buy it.
 * Tier names are lower-cased to match the DB convention.
 */
export const ADDON_CONFIG: Record<
  string,
  {
    name: string;
    slug: string;
    costs: { [tierName: string]: number };
    eligibleTiers: string[];
  }
> = {
  [DATAPLANE_ADDON_LOOKUP_KEY]: {
    name: "Data Plane",
    slug: "data-plane",
    costs: {
      pro: 850,
    },
    eligibleTiers: ["pro"],
  },
};

export const METER_EVENT_NAMES = {
  overageBytes: {
    eventName: "2026_02_overage_bytes",
    payloadKey: "bytes",
  },
  overageSignalRuns: {
    eventName: "2026_02_overage_signal_runs",
    payloadKey: "signal_runs",
  },
} as const;

export const LOOKUP_KEY_TO_TIER_NAME: Record<string, string> = {
  hobby_monthly_2026_02: "Laminar Hobby tier",
  pro_monthly_2026_02: "Laminar Pro tier",
  // Legacy lookup keys
  hobby_monthly_2025_04: "Laminar Hobby tier",
  pro_monthly_2025_04: "Laminar Pro tier",
};

export function tierFromLookupKey(lookupKey: string): PaidTier | null {
  for (const [tier, config] of Object.entries(TIER_CONFIG)) {
    if (config.lookupKey === lookupKey) return tier as PaidTier;
  }
  return null;
}

export interface ItemDescription {
  productDescription: string;
  shortDescription?: string;
  quantity?: number;
}
