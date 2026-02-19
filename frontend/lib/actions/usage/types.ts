export type WorkspaceStats = {
  tierName?: string;
  resetTime: string;
  // GB usage fields
  gbUsedThisMonth: number;
  gbLimit?: number;
  gbOverLimit?: number;
  gbOverLimitCost?: number;
  // Signal runs usage fields
  signalRunsUsedThisMonth: number;
  signalRunsLimit?: number;
  signalRunsOverLimit?: number;
  signalRunsOverLimitCost?: number;
};

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
};
