import { desc, eq } from "drizzle-orm";
import { get, head } from "lodash";
import { type Metadata } from "next";
import { redirect } from "next/navigation";

import { getLastProjectIdCookie } from "@/lib/actions/project/cookies.ts";
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

  // Drop the user into a project's traces, not the workspace settings. /workspace/[id] is now a
  // redirect shim into /settings (Usage), so falling back to it would strand /projects (and the
  // sidebar logo that routes through it) on settings instead of the product. Only when the target
  // workspace has no project do we hand off to the shim, which renders the create-project terminal.
  const project = await db.query.projects.findFirst({
    where: eq(projects.workspaceId, targetWorkspaceId),
    columns: { id: true },
    orderBy: desc(projects.createdAt),
  });

  if (project) {
    return redirect(`/project/${project.id}/traces`);
  }

  return redirect(`/workspace/${targetWorkspaceId}`);
}
