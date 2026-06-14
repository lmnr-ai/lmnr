import { desc, eq } from "drizzle-orm";
import { get, head } from "lodash";
import { redirect } from "next/navigation";

import { getLastProjectIdCookie } from "@/lib/actions/project/cookies.ts";
import { getProjectsByWorkspace } from "@/lib/actions/projects";
import { getLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies.ts";
import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects, workspaces } from "@/lib/db/migrations/schema";

export const dynamic = "force-dynamic";

export default async function SettingsResolver() {
  const session = await getServerSession();
  if (!session) {
    return redirect("/sign-in?callbackUrl=/settings");
  }

  const user = session.user;

  const workspaceLists = await db
    .select({ workspaceId: membersOfWorkspaces.workspaceId })
    .from(membersOfWorkspaces)
    .innerJoin(workspaces, eq(membersOfWorkspaces.workspaceId, workspaces.id))
    .where(eq(membersOfWorkspaces.userId, user.id))
    .orderBy(desc(workspaces.createdAt));

  if (workspaceLists.length === 0) {
    return redirect("/onboarding");
  }

  const lastProjectId = await getLastProjectIdCookie().catch(() => undefined);

  if (lastProjectId) {
    const project = await db.query.projects
      .findFirst({
        where: eq(projects.id, lastProjectId),
        columns: { id: true, workspaceId: true },
      })
      .catch(() => undefined);

    if (project && workspaceLists.some((w) => w.workspaceId === project.workspaceId)) {
      return redirect(`/settings/${project.workspaceId}/${project.id}?section=general`);
    }
  }

  const lastWorkspaceId = await getLastWorkspaceIdCookie().catch(() => undefined);
  const lastWorkspace = workspaceLists.find((w) => w.workspaceId === lastWorkspaceId);
  const targetWorkspaceId = get(lastWorkspace, "workspaceId") ?? (get(head(workspaceLists), "workspaceId") as string);

  const wsProjects = await getProjectsByWorkspace(targetWorkspaceId);
  // No project to anchor the 2-segment URL: hand off to the 1-segment resolver, which renders the
  // create-project terminal directly. Redirecting to /projects instead would add hops through the
  // legacy /workspace shim before landing on that same terminal.
  if (wsProjects.length === 0) {
    return redirect(`/settings/${targetWorkspaceId}`);
  }

  return redirect(`/settings/${targetWorkspaceId}/${wsProjects[0].id}?section=general`);
}
