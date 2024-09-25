export type Project = {
  id: string
  name: string
  workspaceId: string
}

export interface WorkspaceUser {
  id: string
  name: string
  email: string
  role: string
}

export enum WorkspaceTier {
  FREE = 'Free',
  PRO = 'Pro',
}

export interface Workspace {
  id: string
  name: string
  tierName: WorkspaceTier
}

export interface WorkspaceWithProjects extends Workspace {
  projects: Project[]
}

export interface WorkspaceWithUsers extends Workspace {
  users: WorkspaceUser[]
}
