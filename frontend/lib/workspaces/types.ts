export type Project = {
  id: string;
  name: string;
  workspaceId: string;
};

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export enum WorkspaceTier {
  FREE = "Free",
  PRO = "Pro",
}

export interface Workspace {
  id: string;
  name: string;
  tierName: WorkspaceTier;
}

export interface WorkspaceWithProjects extends Workspace {
  projects: Project[];
}

export interface WorkspaceWithUsers extends Workspace {
  users: WorkspaceUser[];
}

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  createdAt: string;
}

export type GetProjectResponse = {
  id: string;
  name: string;
  workspaceId: string;
  spansThisMonth: number;
  spansLimit: number;
  eventsThisMonth: number;
  eventsLimit: number;
  isFreeTier: boolean;
  agentStepsThisMonth: number;
  agentStepsLimit: number;
};

export interface ProjectStats {
  datasetsCount: number;
  spansCount: number;
  evaluationsCount: number;
}
