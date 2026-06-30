import { addMonths } from "date-fns";
import { and, eq } from "drizzle-orm";

import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { cache, PROJECT_CACHE_KEY, WORKSPACE_USAGE_WARNINGS_CACHE_KEY } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import {
  projects,
  subscriptionTiers,
  workspaceHardLimitNotifications,
  workspaces,
  workspaceUsage,
} from "@/lib/db/migrations/schema";
import { getHasClusteringAccess } from "@/lib/features/clustering";

import type { UsageLimitType } from "./custom-usage-limits";

export const isFreeTierWorkspace = async (workspaceId: string): Promise<boolean> => {
  const result = await db
    .select({ tierName: subscriptionTiers.name })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  return result.length > 0 && result[0].tierName.toLowerCase() === "free";
};

export const hasClusteringAccessForProject = async (projectId: string): Promise<boolean> => {
  const result = await db
    .select({ tierName: subscriptionTiers.name })
    .from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  if (result.length === 0) return false;
  return getHasClusteringAccess(result[0].tierName);
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

// Drop the once-per-cycle hard-limit dedup row so a later, legitimately distinct
// hard-limit notification isn't suppressed by a stale `last_notified_at`. There's
// no FK cascade from `workspace_usage_limits` (free tiers have no limit row at all),
// so cleanup is explicit. Called whenever the underlying hard limit is removed.
export const deleteHardLimitNotification = async (workspaceId: string, usageItem: UsageLimitType): Promise<void> => {
  await db
    .delete(workspaceHardLimitNotifications)
    .where(
      and(
        eq(workspaceHardLimitNotifications.workspaceId, workspaceId),
        eq(workspaceHardLimitNotifications.usageItem, usageItem)
      )
    );
};

// When a hard limit is *raised*, only clear the dedup row if the workspace was
// already notified this billing cycle AND the new limit sits above current usage —
// i.e. the workspace is back below its (higher) cap and a future breach is a fresh
// event worth notifying about. If usage already exceeds the new limit, the existing
// stamp correctly continues to suppress duplicate notifications. `workspace_usage`
// is refreshed by cron and may lag up to ~24h, which is acceptable here.
export const clearHardLimitNotificationOnIncrease = async (
  workspaceId: string,
  usageItem: UsageLimitType,
  newLimitValue: number
): Promise<void> => {
  const rows = await db
    .select({
      lastNotifiedAt: workspaceHardLimitNotifications.lastNotifiedAt,
      resetTime: workspaces.resetTime,
      bytes: workspaceUsage.bytes,
      signalCost: workspaceUsage.signalCost,
    })
    .from(workspaceHardLimitNotifications)
    .innerJoin(workspaces, eq(workspaceHardLimitNotifications.workspaceId, workspaces.id))
    .leftJoin(workspaceUsage, eq(workspaceUsage.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaceHardLimitNotifications.workspaceId, workspaceId),
        eq(workspaceHardLimitNotifications.usageItem, usageItem)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return;
  }

  const { lastNotifiedAt, resetTime, bytes, signalCost } = rows[0];
  if (!lastNotifiedAt) {
    return;
  }

  const resetTimeDate = new Date(resetTime);
  const cycleStart = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
  const notifiedThisCycle = new Date(lastNotifiedAt) >= cycleStart;
  if (!notifiedThisCycle) {
    return;
  }

  const currentUsage = usageItem === "bytes" ? (bytes ?? 0) : (signalCost ?? 0);
  if (newLimitValue > currentUsage) {
    await deleteHardLimitNotification(workspaceId, usageItem);
  }
};
