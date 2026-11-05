import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { projects, users } from "@/lib/db/migrations/schema";

/** Email of the member an event is about, copied onto the event as its label. */
export const getUserEmail = async (userId: string): Promise<string | undefined> => {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.email;
};

/** Project name and workspace, read before a delete removes them. */
export const getProjectScope = async (
  projectId: string
): Promise<{ workspaceId: string; projectName: string } | undefined> => {
  const [row] = await db
    .select({ workspaceId: projects.workspaceId, projectName: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row;
};
