import { redirect } from "next/navigation";

import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { requireWorkspaceAccess } from "@/lib/authorization";

// Legacy /workspace/[workspaceId]?tab=... URLs now live under the shared /settings page.
const TAB_TO_SECTION: Record<string, string> = {
  usage: "usage",
  team: "team",
  deployment: "deployment",
  billing: "billing",
  integrations: "integrations",
  reports: "reports",
  settings: "workspace-general",
};

export default async function WorkspaceRedirect(props: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

  // Redirects to /sign-in / notFound() itself.
  await requireWorkspaceAccess(params.workspaceId);

  const tab = searchParams.tab;
  const section = tab ? TAB_TO_SECTION[tab] : undefined;

  // No mapped section (missing tab, or the old "projects" tab) -> land on the workspace settings index.
  if (!section) {
    return redirect(`/settings/${params.workspaceId}`);
  }

  const projects = await getProjectsByWorkspace(params.workspaceId);
  if (projects.length === 0) {
    return redirect("/projects");
  }

  return redirect(`/settings/${params.workspaceId}/${projects[0].id}?section=${section}`);
}
