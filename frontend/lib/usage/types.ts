export type WorkspaceStats = {
  tierName: string;
  totalSpans: number;
  totalEvents: number;
  spansThisMonth: number;
  eventsThisMonth: number;
  spansLimit: number;
  eventsLimit: number;
  spansOverLimit: number;
  spansOverLimitCost: number;
  eventsOverLimit: number;
  eventsOverLimitCost: number;
  members: number;
  membersLimit: number;

  resetTime: string;
  storageLimit: number; // in MiB
};

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
};

export type UserWorkspacesCount = {
  numWorkspaces: number;
  workspacesLimit: number;
};
