export type Project = {
  id: string;
  name: string;
  workspaceId: string;
};

export type WorkspaceRole = "member" | "admin" | "owner";

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  createdAt: string;
}

export enum WorkspaceTier {
  FREE = "Free",
  PRO = "Pro",
  HOBBY = "Hobby",
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

export interface ProjectStats {
  datasetsCount: number;
  spansCount: number;
  evaluationsCount: number;
}

export interface WorkspaceUsage {
  totalBytesIngested: number;
  resetTime: Date;
}
