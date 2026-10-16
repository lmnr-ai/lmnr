import { and, eq } from "drizzle-orm";
import { isNil } from "lodash";
import { notFound, redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth-session";
import {
  cache,
  CLI_PROJECT_MEMBERSHIP_CACHE_KEY,
  PROJECT_MEMBER_CACHE_KEY,
  WORKSPACE_MEMBER_CACHE_KEY,
} from "@/lib/cache.ts";
import { db } from "@/lib/db/drizzle.ts";
import { membersOfWorkspaces, projects } from "@/lib/db/migrations/schema.ts";

import { notTrialLocked, trialLocked } from "./trial-lock";

// A member blocked only by the trial lock is sent to /trial-ended instead of a 404.
const redirectIfTrialLocked = async (userId: string, target: { workspaceId: string } | { projectId: string }) => {
  const rows =
    "workspaceId" in target
      ? await db
          .select({ workspaceId: membersOfWorkspaces.workspaceId })
          .from(membersOfWorkspaces)
          .where(
            and(
              eq(membersOfWorkspaces.workspaceId, target.workspaceId),
              eq(membersOfWorkspaces.userId, userId),
              trialLocked
            )
          )
          .limit(1)
      : await db
          .select({ workspaceId: membersOfWorkspaces.workspaceId })
          .from(membersOfWorkspaces)
          .innerJoin(projects, eq(membersOfWorkspaces.workspaceId, projects.workspaceId))
          .where(and(eq(projects.id, target.projectId), eq(membersOfWorkspaces.userId, userId), trialLocked))
          .limit(1);
  if (rows.length > 0) {
    redirect(`/trial-ended?workspaceId=${rows[0].workspaceId}`);
  }
};

// Membership results are cached for 30 days; call this whenever the trial lock may have changed.
export const invalidateWorkspaceMemberAccessCache = async (workspaceId: string) => {
  try {
    const [members, workspaceProjects] = await Promise.all([
      db
        .select({ userId: membersOfWorkspaces.userId })
        .from(membersOfWorkspaces)
        .where(eq(membersOfWorkspaces.workspaceId, workspaceId)),
      db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId)),
    ]);
    await Promise.all(
      members.flatMap(({ userId }) => [
        cache.remove(WORKSPACE_MEMBER_CACHE_KEY(workspaceId, userId)),
        ...workspaceProjects.flatMap((p) => [
          cache.remove(PROJECT_MEMBER_CACHE_KEY(p.id, userId)),
          cache.remove(CLI_PROJECT_MEMBERSHIP_CACHE_KEY(userId, p.id)),
        ]),
      ])
    );
  } catch (e) {
    console.error(`Failed to invalidate member access cache for workspace ${workspaceId}`, e);
  }
};

export async function requireWorkspaceAccess(workspaceId: string) {
  const session = await getServerSession();
  if (!session) {
    return redirect("/sign-in");
  }

  const cacheKey = WORKSPACE_MEMBER_CACHE_KEY(workspaceId, session.user.id);

  let cached: boolean | null = null;
  try {
    cached = await cache.get<boolean>(cacheKey);
  } catch (e) {
    console.error("Error getting entry from cache", e);
  }
  if (cached === true) {
    return session;
  }
  if (cached === false) {
    await redirectIfTrialLocked(session.user.id, { workspaceId });
    return notFound();
  }

  const results = await db
    .select({ userId: membersOfWorkspaces.userId })
    .from(membersOfWorkspaces)
    .where(
      and(
        eq(membersOfWorkspaces.userId, session.user.id),
        eq(membersOfWorkspaces.workspaceId, workspaceId),
        notTrialLocked
      )
    )
    .limit(1);

  const isMember = results?.length > 0;

  try {
    // 30 days
    await cache.set(cacheKey, isMember, { expireAfterSeconds: 30 * 24 * 60 * 60 });
  } catch (e) {
    console.error("Error setting entry in cache", e);
  }

  if (!isMember) {
    await redirectIfTrialLocked(session.user.id, { workspaceId });
    return notFound();
  }

  return session;
}

export async function requireProjectAccess(projectId: string) {
  const session = await getServerSession();
  if (!session) {
    return redirect("/sign-in");
  }

  const cacheKey = PROJECT_MEMBER_CACHE_KEY(projectId, session?.user?.id);

  let cached: boolean | null = null;
  try {
    cached = await cache.get<boolean>(cacheKey);
  } catch (e) {
    console.error("Error getting entry from cache", e);
  }
  if (cached === true) {
    return session;
  }
  if (cached === false) {
    await redirectIfTrialLocked(session.user.id, { projectId });
    return notFound();
  }

  const results = await db
    .select({ userId: membersOfWorkspaces.userId })
    .from(membersOfWorkspaces)
    .innerJoin(projects, eq(membersOfWorkspaces.workspaceId, projects.workspaceId))
    .where(and(eq(projects.id, projectId), eq(membersOfWorkspaces.userId, session.user.id), notTrialLocked))
    .limit(1);

  const isMember = results?.length > 0;

  try {
    // 30 days
    await cache.set(cacheKey, isMember, { expireAfterSeconds: 30 * 24 * 60 * 60 });
  } catch (e) {
    console.error("Error setting entry in cache", e);
  }

  if (!isMember) {
    await redirectIfTrialLocked(session.user.id, { projectId });
    return notFound();
  }

  return session;
}
export const isUserMemberOfProject = async (projectId: string, userId: string, opts?: { skipCache?: boolean }) => {
  const cacheKey = PROJECT_MEMBER_CACHE_KEY(projectId, userId);

  // Security-sensitive callers (key mint, device-scope write) pass skipCache so a
  // membership cached up to 30 days ago can't authorize a since-removed user.
  if (!opts?.skipCache) {
    try {
      const cached = await cache.get<boolean>(cacheKey);
      if (!isNil(cached)) return cached;
    } catch (e) {
      console.error("Error getting entry from cache", e);
    }
  }

  const result = await db
    .select({ userId: membersOfWorkspaces.userId })
    .from(membersOfWorkspaces)
    .innerJoin(projects, eq(membersOfWorkspaces.workspaceId, projects.workspaceId))
    .where(and(eq(projects.id, projectId), eq(membersOfWorkspaces.userId, userId), notTrialLocked))
    .limit(1);

  const isMember = result.length > 0;

  try {
    // 30 days. Refresh the cache from the fresh read even on skipCache.
    await cache.set(cacheKey, isMember, { expireAfterSeconds: 30 * 24 * 60 * 60 });
  } catch (e) {
    console.error("Error setting entry in cache", e);
  }

  return isMember;
};

export const isUserMemberOfWorkspace = async (workspaceId: string, userId: string) => {
  const cacheKey = WORKSPACE_MEMBER_CACHE_KEY(workspaceId, userId);

  try {
    const cached = await cache.get<boolean>(cacheKey);
    if (!isNil(cached)) return cached;
  } catch (e) {
    console.error("Error getting entry from cache", e);
  }

  const result = await db
    .select({ userId: membersOfWorkspaces.userId })
    .from(membersOfWorkspaces)
    .where(
      and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, userId), notTrialLocked)
    )
    .limit(1);

  const isMember = result.length > 0;

  try {
    // 30 days
    await cache.set(cacheKey, isMember, { expireAfterSeconds: 30 * 24 * 60 * 60 });
  } catch (e) {
    console.error("Error setting entry in cache", e);
  }

  return isMember;
};

export const isProjectInWorkspace = async (projectId: string, workspaceId: string): Promise<boolean> => {
  const result = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);

  return result.length > 0;
};

/**
 * Returns the user's role in the workspace, or null if they are not a member.
 * Not cached — intended for middleware role checks on sensitive routes.
 */
export const getWorkspaceRole = async (workspaceId: string, userId: string): Promise<string | null> => {
  const result = await db
    .select({ memberRole: membersOfWorkspaces.memberRole })
    .from(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, userId)))
    .limit(1);

  return result[0]?.memberRole ?? null;
};
