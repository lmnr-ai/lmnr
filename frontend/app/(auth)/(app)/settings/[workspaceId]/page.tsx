import { redirect } from "next/navigation";

import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { requireWorkspaceAccess } from "@/lib/authorization";

export default async function WorkspaceSettingsResolver(props: { params: Promise<{ workspaceId: string }> }) {
  const params = await props.params;

  // Redirects to /sign-in / notFound() itself.
  await requireWorkspaceAccess(params.workspaceId);

  const projects = await getProjectsByWorkspace(params.workspaceId);
  if (projects.length === 0) {
    return redirect("/projects");
  }

  return redirect(`/settings/${params.workspaceId}/${projects[0].id}?section=usage`);
}
