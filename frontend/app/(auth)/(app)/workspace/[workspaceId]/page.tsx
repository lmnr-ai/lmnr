import { redirect } from "next/navigation";

import { getWorkspaceSettingsPath } from "@/lib/actions/projects";
import { requireWorkspaceAccess } from "@/lib/authorization";

// Backcompat-only shim. The /workspace route is gone; settings live at /project/[id]/settings
// (addressed by ?tab=). This exists solely so already-sent emails (app-server email.rs builds
// /workspace/{id}?tab=usage and ?tab=reports links) keep resolving — it remaps the legacy
// workspace "settings" tab to "workspace-general" and redirects to the workspace's project
// settings. New in-app links go straight to /project/[id]/settings.
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
