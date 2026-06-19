import { type SessionProject } from "@/lib/actions/cli-auth";

// Shared project-creation fetch helpers for the CLI-auth flow. Used by both the
// in-picker "+ Create project" modal (CreateProjectDialog) and the zero-project
// "Create your first project" step (CreateFirstProject), so the two stay in sync.

// Existing workspace → POST /api/workspaces/:workspaceId/projects.
export async function createProjectInWorkspace(
  name: string,
  workspaceId: string,
  workspaceName: string
): Promise<SessionProject | null> {
  const res = await fetch(`/api/workspaces/${workspaceId}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to create project");
  }
  const project = await res.json();
  if (!project?.id) return null;
  return { id: project.id, name, workspaceId, workspaceName };
}

// Brand-new user (0 workspaces) → POST /api/workspaces { isFirstProject: true }.
export async function createWorkspaceWithProject(name: string, workspaceName: string): Promise<SessionProject | null> {
  const res = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: workspaceName, projectName: name, isFirstProject: true }),
  });
  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to create project");
  }
  const data = await res.json();
  if (!data?.projectId) return null;
  return { id: data.projectId, name, workspaceId: data.id ?? "", workspaceName };
}
