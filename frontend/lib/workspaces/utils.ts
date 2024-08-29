import { ProjectWithWorkspace, WorkspaceWithProjects } from "./types";

export function workspacesWithProjectsToProjectsWithWorkspaces(workspaces: WorkspaceWithProjects[]): ProjectWithWorkspace[] {
  let projectsWithWorkspaces: ProjectWithWorkspace[] = [];
  for (const workspace of workspaces) {
    for (const project of workspace.projects) {
      projectsWithWorkspaces.push({
        id: project.id!,
        name: project.name,
        workspace: {
          id: workspace.id,
          name: workspace.name
        }
      })
    }
  }
  return projectsWithWorkspaces;
}