import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { cache, PROJECT_CACHE_KEY } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces, workspaceUsageLimits } from "@/lib/db/migrations/schema";

export const USAGE_LIMIT_TYPES = ["bytes", "signal_runs"] as const;
export type UsageLimitType = (typeof USAGE_LIMIT_TYPES)[number];

export interface WorkspaceUsageLimit {
  id: string;
  workspaceId: string;
  limitType: UsageLimitType;
  limitValue: number;
}

const GetUsageLimitsSchema = z.object({
  workspaceId: z.string(),
});

const SetUsageLimitSchema = z.object({
  workspaceId: z.string(),
  limitType: z.enum(USAGE_LIMIT_TYPES),
  limitValue: z.number().int().nonnegative(),
});

const RemoveUsageLimitSchema = z.object({
  workspaceId: z.string(),
  limitType: z.enum(USAGE_LIMIT_TYPES),
});

export async function getUsageLimits(input: z.infer<typeof GetUsageLimitsSchema>): Promise<WorkspaceUsageLimit[]> {
  const { workspaceId } = GetUsageLimitsSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin", "member"] });

  const limits = await db
    .select({
      id: workspaceUsageLimits.id,
      workspaceId: workspaceUsageLimits.workspaceId,
      limitType: workspaceUsageLimits.limitType,
      limitValue: workspaceUsageLimits.limitValue,
    })
    .from(workspaceUsageLimits)
    .where(eq(workspaceUsageLimits.workspaceId, workspaceId));

  return limits as WorkspaceUsageLimit[];
}

async function isFreeTierWorkspace(workspaceId: string): Promise<boolean> {
  const result = await db
    .select({ tierName: subscriptionTiers.name })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return result.length > 0 && result[0].tierName.toLowerCase() === "free";
}

export async function setUsageLimit(input: z.infer<typeof SetUsageLimitSchema>): Promise<WorkspaceUsageLimit> {
  const { workspaceId, limitType, limitValue } = SetUsageLimitSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  if (await isFreeTierWorkspace(workspaceId)) {
    throw new Error("Custom usage limits are not available on the free tier.");
  }

  const [result] = await db
    .insert(workspaceUsageLimits)
    .values({
      workspaceId,
      limitType,
      limitValue,
    })
    .onConflictDoUpdate({
      target: [workspaceUsageLimits.workspaceId, workspaceUsageLimits.limitType],
      set: { limitValue },
    })
    .returning({
      id: workspaceUsageLimits.id,
      workspaceId: workspaceUsageLimits.workspaceId,
      limitType: workspaceUsageLimits.limitType,
      limitValue: workspaceUsageLimits.limitValue,
    });

  // Invalidate project cache entries for all projects in this workspace
  // so the app-server picks up the new limits
  await invalidateProjectCacheForWorkspace(workspaceId);

  return result as WorkspaceUsageLimit;
}

export async function removeUsageLimit(input: z.infer<typeof RemoveUsageLimitSchema>): Promise<void> {
  const { workspaceId, limitType } = RemoveUsageLimitSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });

  if (await isFreeTierWorkspace(workspaceId)) {
    throw new Error("Custom usage limits are not available on the free tier.");
  }

  await db
    .delete(workspaceUsageLimits)
    .where(and(eq(workspaceUsageLimits.workspaceId, workspaceId), eq(workspaceUsageLimits.limitType, limitType)));

  await invalidateProjectCacheForWorkspace(workspaceId);
}

async function invalidateProjectCacheForWorkspace(workspaceId: string): Promise<void> {
  try {
    const workspaceProjects = await db.query.projects.findMany({
      where: eq(projects.workspaceId, workspaceId),
      columns: { id: true },
    });

    await Promise.all(workspaceProjects.map((project) => cache.remove(`${PROJECT_CACHE_KEY}:${project.id}`)));
  } catch (e) {
    console.error("Error clearing project cache after usage limit change", e);
  }
}
