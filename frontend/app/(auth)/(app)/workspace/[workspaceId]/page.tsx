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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

  // Redirects to /sign-in / notFound() itself.
  await requireWorkspaceAccess(params.workspaceId);

  const tab = typeof searchParams.tab === "string" ? searchParams.tab : undefined;
  const section = tab ? TAB_TO_SECTION[tab] : undefined;

  // Preserve every other query param (e.g. Slack OAuth's ?slack=success|error,
  // which the integrations card reads to surface the connection result).
  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => rest.append(key, v));
    } else {
      rest.append(key, value);
    }
  }

  // No mapped section (missing tab, or the old "projects" tab) -> land on the workspace settings index.
  if (!section) {
    const query = rest.toString();
    return redirect(`/settings/${params.workspaceId}${query ? `?${query}` : ""}`);
  }

  const projects = await getProjectsByWorkspace(params.workspaceId);
  // Empty workspace -> the bare /settings/[id] resolver renders the create-project terminal.
  // Don't redirect to /projects: it routes back here and loops endlessly.
  if (projects.length === 0) {
    const query = rest.toString();
    return redirect(`/settings/${params.workspaceId}${query ? `?${query}` : ""}`);
  }

  rest.set("section", section);
  return redirect(`/settings/${params.workspaceId}/${projects[0].id}?${rest.toString()}`);
}
