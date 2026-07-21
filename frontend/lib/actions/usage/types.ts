export const USAGE_LIMIT_TYPES = ["bytes", "signal_cost"] as const;
export type UsageLimitType = (typeof USAGE_LIMIT_TYPES)[number];

export type WorkspaceStats = {
  tierName?: string;
  resetTime: string;
  // GB usage fields
  gbUsedThisMonth: number;
  gbLimit?: number;
  gbOverLimit?: number;
  gbOverLimitCost?: number;
  // Signal cost usage fields, denominated in micro-USD (1e-6 USD)
  signalCostUsedThisMonth: number;
  signalCostLimit?: number;
  signalCostOverLimit?: number;
  signalCostOverLimitUsd?: number;
};

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
};
