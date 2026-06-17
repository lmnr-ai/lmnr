import { redirect } from "next/navigation";

import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { requireWorkspaceAccess } from "@/lib/authorization";

// Redirect shim. The /workspace route is gone; settings live at /project/[id]/settings (addressed
// by ?tab=). It remaps the legacy workspace "settings" tab to "workspace-general" and redirects to
// the workspace's project settings. Two consumers:
//   1. already-sent emails (app-server email.rs builds /workspace/{id}?tab=usage and ?tab=reports);
//   2. in-app links that know only a workspace id and may render without ProjectContext — e.g. the
//      create-project dialog in the project-less /projects surface, where settingsHref can't help.
// In-app links that DO have project context go straight to /project/[id]/settings instead.
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

  // Resolves the workspace's project; falls back to /projects when it has none.
  const target = await getWorkspaceSettingsPath(params.workspaceId, section);

  // Preserve any other incoming params (e.g. sessionId) on top of the resolved path.
  const passthrough = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "tab" || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => passthrough.append(key, v));
    } else {
      passthrough.append(key, value);
    }
  }
  const extra = passthrough.toString();
  redirect(extra ? `${target}${target.includes("?") ? "&" : "?"}${extra}` : target);
}
