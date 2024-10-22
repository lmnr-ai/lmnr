import { db } from "./drizzle";
import { eq, and } from "drizzle-orm";
import { membersOfWorkspaces, projects, users } from "./schema";
import { getServerSession } from 'next-auth';
import { authOptions } from "../auth";

export const isCurrentUserMemberOfProject = async (projectId: string) => {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user) {
    return false;
  }

  const result = await db
    .select({ userId: users.id })
    .from(users)
    .innerJoin(membersOfWorkspaces, eq(users.id, membersOfWorkspaces.userId))
    .innerJoin(projects, eq(membersOfWorkspaces.workspaceId, projects.workspaceId))
    .where(and(
      eq(users.email, user.email!),
      eq(projects.id, projectId)
    ))
    .limit(1);

  return result.length > 0;
};
