import { type SessionProject } from "@/lib/actions/cli-auth";

// Project creation for the CLI-auth flow's "+ Create project" modal. The
// zero-project case never gets here — the server creates that project itself
// when the device code is approved (`resolveDefaultProject`).
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
