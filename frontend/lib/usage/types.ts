export type WorkspaceStats = {
  tierName: string;
  seatsIncludedInTier: number;
  totalSpans: number;
  spansThisMonth: number;
  spansLimit: number;
  spansOverLimit: number;
  spansOverLimitCost: number;
  members: number;
  membersLimit: number;
  resetTime: string;
  stepsLimit: number;
  stepsOverLimit: number;
  stepsOverLimitCost: number;
  stepsThisMonth: number;
  // storageLimit: number; // in MiB
};

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
};
