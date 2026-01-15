import { desc, eq } from "drizzle-orm";
import { get, head } from "lodash";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { getLastProjectIdCookie } from "@/lib/actions/project/cookies.ts";
import { getLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies.ts";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, projects, workspaces } from "@/lib/db/migrations/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  let session;
  try {
    session = await getServerSession(authOptions);
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

  const lastProjectId = await getLastProjectIdCookie();

  if (lastProjectId) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, lastProjectId),
      columns: {
        id: true,
        workspaceId: true,
      },
    });

    if (project) {
      const hasAccess = workspaceLists.some((w) => w.workspaceId === project.workspaceId);
      if (hasAccess) {
        return redirect(`/project/${project.id}/traces`);
      }
    }
  }

  const lastWorkspaceId = await getLastWorkspaceIdCookie();

  const lastWorkspace = workspaceLists.find((w) => w.workspaceId === lastWorkspaceId);

  const targetWorkspaceId = get(lastWorkspace, "workspaceId") ?? (get(head(workspaceLists), "workspaceId") as string);

  return redirect(`/workspace/${targetWorkspaceId}`);
}
