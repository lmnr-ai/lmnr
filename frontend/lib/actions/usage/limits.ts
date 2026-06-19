import { addMonths, subHours } from "date-fns";
import { and, eq } from "drizzle-orm";

import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { cache, PROJECT_CACHE_KEY, WORKSPACE_SIGNAL_STEPS_USAGE_CACHE_KEY } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces, workspaceUsageLimits } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

const TIER_RETENTION_DAYS: Record<string, number> = {
  free: 15,
  hobby: 30,
  pro: 90,
};

interface ProjectBillingInfo {
  id: string;
  name: string;
  workspaceId: string;
  tierName: string;
  resetTime: string;
  workspaceProjectIds: string[];
  bytesLimit: number;
  signalStepsLimit: number;
  customSignalStepsLimit?: number | null;
}

interface BillingInfo {
  workspaceId: string;
  tierName: string;
  signalStepsLimit: number;
  resetTime: string;
  workspaceProjectIds: string[];
  customSignalStepsLimit: number | null;
}

async function getProjectBillingInfo(projectId: string): Promise<BillingInfo | null> {
  const projectCacheKey = `${PROJECT_CACHE_KEY}:${projectId}`;
  try {
    const cached = await cache.get<ProjectBillingInfo>(projectCacheKey);
    if (cached) {
      return {
        workspaceId: cached.workspaceId,
        tierName: cached.tierName,
        signalStepsLimit: Number(cached.signalStepsLimit),
        resetTime: cached.resetTime,
        workspaceProjectIds: cached.workspaceProjectIds,
        customSignalStepsLimit: cached.customSignalStepsLimit != null ? Number(cached.customSignalStepsLimit) : null,
      };
    }
  } catch {
    // cache read failed, fall through to DB
  }

  const tierRows = await db
    .select({
      workspaceId: workspaces.id,
      signalStepsLimit: subscriptionTiers.signalStepsProcessed,
      resetTime: workspaces.resetTime,
      tierName: subscriptionTiers.name,
    })
    .from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  if (tierRows.length === 0) {
    return null;
  }

  const row = tierRows[0];

  const [projectRows, customLimitRows] = await Promise.all([
    db.query.projects.findMany({
      where: eq(projects.workspaceId, row.workspaceId),
      columns: { id: true },
    }),
    db
      .select({ limitValue: workspaceUsageLimits.limitValue })
      .from(workspaceUsageLimits)
      .where(
        and(
          eq(workspaceUsageLimits.workspaceId, row.workspaceId),
          eq(workspaceUsageLimits.limitType, "signal_steps_processed")
        )
      )
      .limit(1),
  ]);

  return {
    workspaceId: row.workspaceId,
    tierName: row.tierName,
    signalStepsLimit: Number(row.signalStepsLimit),
    resetTime: row.resetTime,
    workspaceProjectIds: projectRows.map((p) => p.id),
    customSignalStepsLimit: customLimitRows.length > 0 ? Number(customLimitRows[0].limitValue) : null,
  };
}

export async function checkSignalRunsLimit(projectId: string, tracesCount: number): Promise<void> {
  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) {
    return;
  }

  const info = await getProjectBillingInfo(projectId);
  if (!info) {
    return;
  }

  const {
    workspaceId,
    tierName,
    signalStepsLimit: signalRunsLimit,
    resetTime,
    workspaceProjectIds,
    customSignalStepsLimit: customSignalRunsLimit,
  } = info;
  const isFree = tierName.trim().toLowerCase() === "free";

  let effectiveLimit: number;
  if (isFree) {
    effectiveLimit = signalRunsLimit;
  } else {
    // For paid tiers, use the custom signal_runs limit if set
    if (customSignalRunsLimit == null) {
      return; // No custom limit for paid tier, no enforcement
    }
    effectiveLimit = customSignalRunsLimit;
  }

  // For free tier, signalRunsLimit=0 means "no limit configured on this tier"
  // For custom limits (paid tiers), 0 means "block everything" so we don't skip
  if (isFree && effectiveLimit === 0) {
    return;
  }

  const usageCacheKey = `${WORKSPACE_SIGNAL_STEPS_USAGE_CACHE_KEY}:${workspaceId}`;

  let totalSignalSteps: number | null = null;
  try {
    totalSignalSteps = await cache.get<number>(usageCacheKey);
  } catch {
    // cache read failed, fall through to ClickHouse
  }

  if (totalSignalSteps === null) {
    if (workspaceProjectIds.length === 0) {
      return;
    }

    const resetTimeDate = new Date(resetTime);
    const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
    const latestResetTimeStr = latestResetTime.toISOString().replace(/Z$/, "");

    const signalRunsQuery = `SELECT SUM(IF(steps_processed > 0, steps_processed, 1)) as totalSignalSteps
    FROM signal_runs FINAL
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { latestResetTime: DateTime(3, "UTC") }
    AND signal_runs.status = 1`;

    const result = await clickhouseClient.query({
      query: signalRunsQuery,
      format: "JSONEachRow",
      query_params: { projectIds: workspaceProjectIds, latestResetTime: latestResetTimeStr },
    });
    const rows = await result.json<{ totalSignalSteps: number }>();
    totalSignalSteps = rows.length > 0 ? Number(rows[0].totalSignalSteps) : 0;
  }

  if (totalSignalSteps + tracesCount > effectiveLimit) {
    const remaining = Math.max(effectiveLimit - totalSignalSteps, 0);
    throw new Error(
      `Signal steps processed limit exceeded. This job requires at least ${tracesCount} signal steps processed, but your workspace only has ${remaining} remaining out of ${effectiveLimit} allowed this billing period.${isFree ? " Please upgrade your plan." : ""}`
    );
  }
}

export async function checkDataRetentionAccess(
  projectId: string,
  timeRange: { pastHours?: string; startDate?: string }
): Promise<Response | null> {
  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) {
    return null;
  }

  const info = await getProjectBillingInfo(projectId);
  if (!info) {
    return null;
  }

  const tierKey = info.tierName.trim().toLowerCase();
  const retentionDays = TIER_RETENTION_DAYS[tierKey];
  if (retentionDays === undefined) {
    return null;
  }

  let effectiveStart: Date | null = null;

  if (timeRange.pastHours) {
    effectiveStart = subHours(new Date(), parseInt(timeRange.pastHours));
  } else if (timeRange.startDate) {
    effectiveStart = new Date(timeRange.startDate);
  }

  if (!effectiveStart) {
    return null;
  }

  const retentionCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  if (effectiveStart < retentionCutoff) {
    return Response.json(
      {
        error: `Forbidden.`,
      },
      { status: 403 }
    );
  }

  return null;
}
