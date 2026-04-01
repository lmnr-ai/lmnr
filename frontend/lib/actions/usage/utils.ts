import { eq } from "drizzle-orm";

import { cache, PROJECT_CACHE_KEY, WORKSPACE_USAGE_WARNINGS_CACHE_KEY } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";

export const isFreeTierWorkspace = async (workspaceId: string): Promise<boolean> => {
  const result = await db
    .select({ tierName: subscriptionTiers.name })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return result.length > 0 && result[0].tierName.toLowerCase() === "free";
};

export const invalidateProjectCacheForWorkspace = async (workspaceId: string): Promise<void> => {
  try {
    const workspaceProjects = await db.query.projects.findMany({
      where: eq(projects.workspaceId, workspaceId),
      columns: { id: true },
    });

    await Promise.all(workspaceProjects.map((project) => cache.remove(`${PROJECT_CACHE_KEY}:${project.id}`)));
  } catch (e) {
    console.error("Error clearing project cache after usage limit change", e);
  }
};

export const invalidateUsageWarningsCacheForWorkspace = async (workspaceId: string): Promise<void> => {
  try {
    await cache.remove(`${WORKSPACE_USAGE_WARNINGS_CACHE_KEY}:${workspaceId}`);
  } catch (e) {
    console.error("Error clearing usage warnings cache", e);
  }
};
