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
  // storageLimit: number; // in MiB
};

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
};

export type UserWorkspacesCount = {
  numWorkspaces: number;
  workspacesLimit: number;
};
