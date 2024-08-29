export type Project = {
  id?: string
  name: string
  workspaceId: string
}

export type ProjectWithWorkspace = {
  id: string
  name: string
  workspace: Workspace
}

export interface Workspace {
  id: string
  name: string
}

export interface WorkspaceWithProjects {
  id: string
  name: string
  projects: Project[]
}

export interface WorkspaceUser {
  id: string
  name: string
  email: string
  role: string
}

export interface WorkspaceWithInfo {
  id: string
  name: string
  users: WorkspaceUser[]
}