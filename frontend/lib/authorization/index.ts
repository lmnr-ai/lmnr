import { and, eq } from "drizzle-orm";
import { isNil } from "lodash";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { cache, PROJECT_MEMBER_CACHE_KEY, WORKSPACE_MEMBER_CACHE_KEY } from "@/lib/cache.ts";
import { db } from "@/lib/db/drizzle.ts";
import { membersOfWorkspaces, projects } from "@/lib/db/migrations/schema.ts";

export async function requireWorkspaceAccess(workspaceId: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in");
  }

  const cacheKey = WORKSPACE_MEMBER_CACHE_KEY(workspaceId, session?.user?.id);

  try {
    const cached = await cache.get<boolean>(cacheKey);
    if (!isNil(cached)) {
      return cached ? session : notFound();
    }
  } catch (e) {
    console.error("Error getting entry from cache", e);
  }

  const results = await db
    .select({ userId: membersOfWorkspaces.userId })
    .from(membersOfWorkspaces)
    .where(and(eq(membersOfWorkspaces.userId, session?.user?.id), eq(membersOfWorkspaces.workspaceId, workspaceId)))
    .limit(1);

  const isMember = results?.length > 0;

  try {
    // 30 days
    await cache.set(cacheKey, isMember, { expireAfterSeconds: 30 * 24 * 60 * 60 });
  } catch (e) {
    console.error("Error setting entry in cache", e);
  }

  if (!isMember) {
    return notFound();
  }

  return session;
}

export async function requireProjectAccess(projectId: string) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return redirect("/sign-in");
  }

  const cacheKey = PROJECT_MEMBER_CACHE_KEY(projectId, session?.user?.id);

  try {
    const cached = await cache.get<boolean>(cacheKey);
    if (!isNil(cached)) {
      return cached ? session : notFound();
    }
  } catch (e) {
    console.error("Error getting entry from cache", e);
  }

  const results = await db
    .select({ userId: membersOfWorkspaces.userId })
    .from(membersOfWorkspaces)
    .innerJoin(projects, eq(membersOfWorkspaces.workspaceId, projects.workspaceId))
    .where(and(eq(projects.id, projectId), eq(membersOfWorkspaces.userId, session?.user?.id)))
    .limit(1);

  const isMember = results?.length > 0;

  try {
    // 30 days
    await cache.set(cacheKey, isMember, { expireAfterSeconds: 30 * 24 * 60 * 60 });
  } catch (e) {
    console.error("Error setting entry in cache", e);
  }

  if (!isMember) {
    return notFound();
  }

  return session;
}
export const isUserMemberOfProject = async (projectId: string, userId: string) => {
  const cacheKey = PROJECT_MEMBER_CACHE_KEY(projectId, userId);

  try {
    const cached = await cache.get<boolean>(cacheKey);
    if (!isNil(cached)) return cached;
  } catch (e) {
    console.error("Error getting entry from cache", e);
  }

  const result = await db
    .select({ userId: membersOfWorkspaces.userId })
    .from(membersOfWorkspaces)
    .innerJoin(projects, eq(membersOfWorkspaces.workspaceId, projects.workspaceId))
    .where(and(eq(projects.id, projectId), eq(membersOfWorkspaces.userId, userId)))
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
    .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.userId, userId)))
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
