import { desc, eq } from "drizzle-orm";
import { get, head } from "lodash";
import { type Metadata } from "next";
import { redirect } from "next/navigation";

import WorkspaceGroupTracker from "@/components/common/workspace-group-tracker";
import Projects from "@/components/projects/projects";
import { getLastProjectIdCookie } from "@/lib/actions/project/cookies.ts";
import { getWorkspace } from "@/lib/actions/workspace";
import { getLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies.ts";
import { getServerSession } from "@/lib/auth-session";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects, workspaces } from "@/lib/db/migrations/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  let session;
  try {
    session = await getServerSession();
  } catch (e) {
    console.error(e);
    return redirect("/sign-in?callbackUrl=/projects");
  }

  if (!session) {
    return redirect("/sign-in?callbackUrl=/projects");
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
        columns: {
          id: true,
          workspaceId: true,
        },
      })
      .catch(() => undefined);

    if (project) {
      const hasAccess = workspaceLists.some((w) => w.workspaceId === project.workspaceId);
      if (hasAccess) {
        return redirect(`/project/${project.id}/traces`);
      }
    }
  }

  const lastWorkspaceId = await getLastWorkspaceIdCookie().catch(() => undefined);

  const lastWorkspace = workspaceLists.find((w) => w.workspaceId === lastWorkspaceId);

  const targetWorkspaceId = get(lastWorkspace, "workspaceId") ?? (get(head(workspaceLists), "workspaceId") as string);

  // Drop the user into a project's traces — the product, not settings.
  const project = await db.query.projects.findFirst({
    where: eq(projects.workspaceId, targetWorkspaceId),
    columns: { id: true },
    orderBy: desc(projects.createdAt),
  });

  if (project) {
    return redirect(`/project/${project.id}/traces`);
  }

  // The target workspace has no project. There's no /workspace route anymore and no project to
  // anchor settings, so render the create-project surface here — the only exit from an empty
  // workspace (the project sidebar's create-project picker isn't reachable without a project).
  const workspace = await getWorkspace({ workspaceId: targetWorkspaceId });
  return (
    <>
      <WorkspaceGroupTracker workspaceId={workspace.id} workspaceName={workspace.name} />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4 py-8">
          <Projects workspace={workspace} />
        </div>
      </div>
    </>
  );
}
