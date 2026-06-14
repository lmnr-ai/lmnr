import { redirect } from "next/navigation";

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

  // Carry the mapped section through (a missing/unmapped tab, incl. the old "projects" tab, lands on
  // the settings index). Always redirect to the 1-segment resolver and let it pick the project —
  // it honors the last-project cookie (matching /settings) and renders the create-project terminal
  // for an empty workspace, so the shim must NOT hardcode projects[0] (would ignore the cookie).
  if (section) {
    rest.set("section", section);
  }
  const query = rest.toString();
  return redirect(`/settings/${params.workspaceId}${query ? `?${query}` : ""}`);
}
