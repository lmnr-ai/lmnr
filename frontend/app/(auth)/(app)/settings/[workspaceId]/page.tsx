import { redirect } from "next/navigation";

import WorkspaceGroupTracker from "@/components/common/workspace-group-tracker";
import Projects from "@/components/projects/projects";
import WorkspaceMenuProvider from "@/components/workspace/workspace-menu-provider.tsx";
import { getLastProjectIdCookie } from "@/lib/actions/project/cookies.ts";
import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { getWorkspace } from "@/lib/actions/workspace";
import { requireWorkspaceAccess } from "@/lib/authorization";

export default async function WorkspaceSettingsResolver(props: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);

  // Redirects to /sign-in / notFound() itself.
  await requireWorkspaceAccess(params.workspaceId);

  const projects = await getProjectsByWorkspace(params.workspaceId);
  // An empty workspace has no project to anchor the 2-segment settings URL. Don't redirect to
  // /projects — that bounces back here via the /workspace shim in an endless loop. Render a
  // terminal "create a project" surface instead, the only way out of a project-less workspace.
  if (projects.length === 0) {
    const workspace = await getWorkspace({ workspaceId: params.workspaceId });
    return (
      <WorkspaceMenuProvider>
        <WorkspaceGroupTracker workspaceId={workspace.id} workspaceName={workspace.name} />
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4 py-8">
            <Projects workspace={workspace} />
          </div>
        </div>
      </WorkspaceMenuProvider>
    );
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

  // The workspace picker links here without a project id, so honor the last-used project cookie
  // (matching /settings's resolver) instead of always landing on projects[0].
  const lastProjectId = await getLastProjectIdCookie().catch(() => undefined);
  const targetProject = projects.find((p) => p.id === lastProjectId) ?? projects[0];

  return redirect(`/settings/${params.workspaceId}/${targetProject.id}?${query.toString()}`);
}
