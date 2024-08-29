export type UserStats = {
  planName: string;
  totalRuns?: number;
  runsThisMonth?: number;
  runsLimitPerWorkspace: number;
  codegensLimitPerWorkspace: number;
  runsLimit?: number;
  runsNextResetTime?: string;

  // storage is an expensive query, so fetched separately
  storageMibLimitPerWorkspace: number;
  storageMibLimit?: number;
  logRetentionDays: number;
  membersPerWorkspace: number;
  numWorkspaces?: number;

  workspacesLimit: number;
  additionalSeats: number;
}

export type StorageStats = {
  storageMib?: number; // total storage used in MiB
}

export type WorkspaceStats = {
  totalRuns: number;
  runsThisMonth: number;
  totalCodegens: number;
  codegensThisMonth: number;
  runsNextResetTime?: string;

  membersCount?: number;
  projectsCount?: number;
}
