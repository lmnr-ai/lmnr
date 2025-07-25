export type WorkspaceStats = {
  tierName: string;
  seatsIncludedInTier: number;
  members: number;
  membersLimit: number;
  resetTime: string;
  // GB usage fields
  gbUsedThisMonth: number;
  gbLimit: number;
  gbOverLimit: number;
  gbOverLimitCost: number;
  // storageLimit: number; // in MiB
};

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
};
