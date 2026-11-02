export interface GithubIntegrationInfo {
  accountLogin: string;
  suspended: boolean;
  // Where installation access is changed on GitHub; works for owners and members alike.
  manageUrl: string;
}

export interface ProjectGithubRepo {
  repoId: number;
  repoFullName: string;
  defaultBranch: string;
}

export interface GithubRepoOption {
  id: number;
  fullName: string;
  private: boolean;
}

// The `?github=` value the connect callback appends to returnTo.
export const GITHUB_CONNECT_STATUSES = ["connected", "pending", "taken", "error"] as const;
export type GithubConnectStatus = (typeof GITHUB_CONNECT_STATUSES)[number];
