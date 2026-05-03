export type WorkspaceStats = {
  tierName?: string;
  resetTime: string;
  // GB usage fields
  gbUsedThisMonth: number;
  gbLimit?: number;
  gbOverLimit?: number;
  gbOverLimitCost?: number;
  // Signal runs usage fields
  signalStepsUsedThisMonth: number;
  signalStepsLimit?: number;
  signalStepsOverLimit?: number;
  signalStepsOverLimitCost?: number;
};

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
};
