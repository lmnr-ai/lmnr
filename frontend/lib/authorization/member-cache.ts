import { eq } from "drizzle-orm";

import { cache, PROJECT_MEMBER_CACHE_KEY, WORKSPACE_MEMBER_CACHE_KEY } from "@/lib/cache.ts";
import { db } from "@/lib/db/drizzle.ts";
import { membersOfWorkspaces, projects } from "@/lib/db/migrations/schema.ts";

// Kept free of `@/lib/auth-session` so `lib/auth.ts` can import it without a cycle.

// Access checks (web and CLI) cache negative results for 7 days, so every membership change (add,
// remove, trial lock) must clear them, or a user who opened a project link before
// joining keeps hitting a 404 after accepting the invite.
export const invalidateMemberAccessCache = async (workspaceId: string, userIds: string[]) => {
  if (userIds.length === 0) return;
  try {
    const workspaceProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));
    await Promise.all(
      userIds.flatMap((userId) => [
        cache.remove(WORKSPACE_MEMBER_CACHE_KEY(workspaceId, userId)),
        ...workspaceProjects.map((p) => cache.remove(PROJECT_MEMBER_CACHE_KEY(p.id, userId))),
      ])
    );
  } catch (e) {
    console.error(`Failed to invalidate member access cache for workspace ${workspaceId}`, e);
  }
};

// Call this whenever the trial lock may have changed for the whole workspace.
export const invalidateWorkspaceMemberAccessCache = async (workspaceId: string) => {
  try {
    const members = await db
      .select({ userId: membersOfWorkspaces.userId })
      .from(membersOfWorkspaces)
      .where(eq(membersOfWorkspaces.workspaceId, workspaceId));
    await invalidateMemberAccessCache(
      workspaceId,
      members.map(({ userId }) => userId)
    );
  } catch (e) {
    console.error(`Failed to invalidate member access cache for workspace ${workspaceId}`, e);
  }
};
