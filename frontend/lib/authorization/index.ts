import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { getProjectDetails } from "@/lib/actions/project";
import { authOptions } from "@/lib/auth";
import { isCurrentUserMemberOfWorkspace } from "@/lib/db/utils";

export async function requireWorkspaceAccess(workspaceId: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in");
  }

  const hasAccess = await isCurrentUserMemberOfWorkspace(workspaceId);
  if (!hasAccess) {
    return notFound();
  }

  return session;
}

export async function requireProjectAccess(projectId: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in");
  }

  let projectDetails;
  try {
    projectDetails = await getProjectDetails(projectId);
  } catch {
    return notFound();
  }

  const hasAccess = await isCurrentUserMemberOfWorkspace(projectDetails.workspaceId);
  if (!hasAccess) {
    return notFound();
  }

  return { session, project: projectDetails };
}
