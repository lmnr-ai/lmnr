import { redirect } from "next/navigation";

import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { requireWorkspaceAccess } from "@/lib/authorization";

export default async function WorkspaceSettingsResolver(props: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

  // Redirects to /sign-in / notFound() itself.
  await requireWorkspaceAccess(params.workspaceId);

  const projects = await getProjectsByWorkspace(params.workspaceId);
  if (projects.length === 0) {
    return redirect("/projects");
  }

  // Preserve every incoming query param (e.g. Slack OAuth's ?slack=success|error,
  // forwarded here by the legacy /workspace shim) while defaulting to the usage section.
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((v) => query.append(key, v));
    } else {
      query.append(key, value);
    }
  }
  if (!query.has("section")) {
    query.set("section", "usage");
  }

  return redirect(`/settings/${params.workspaceId}/${projects[0].id}?${query.toString()}`);
}
