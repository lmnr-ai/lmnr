export type WorkspaceStats = {
  tierName: string;
  seatsIncludedInTier: number;
  totalSpans: number;
  spansThisMonth: number;
  members: number;
  membersLimit: number;
  resetTime: string;
  stepsLimit: number;
  stepsOverLimit: number;
  stepsOverLimitCost: number;
  stepsThisMonth: number;
  // GB usage fields
  totalGBUsed: number;
  gbUsedThisMonth: number;
  gbLimit: number;
  gbOverLimit: number;
  gbOverLimitCost: number;
  // storageLimit: number; // in MiB
};

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
};
