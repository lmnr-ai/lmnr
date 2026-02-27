import { addMonths } from "date-fns";
import { eq } from "drizzle-orm";

import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { cache, PROJECT_CACHE_KEY, WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

interface ProjectBillingInfo {
  id: string;
  name: string;
  workspaceId: string;
  tierName: string;
  resetTime: string;
  workspaceProjectIds: string[];
  bytesLimit: number;
  signalRunsLimit: number;
}

interface BillingInfo {
  workspaceId: string;
  tierName: string;
  signalRunsLimit: number;
  resetTime: string;
  workspaceProjectIds: string[];
}

async function getProjectBillingInfo(projectId: string): Promise<BillingInfo | null> {
  const projectCacheKey = `${PROJECT_CACHE_KEY}:${projectId}`;
  try {
    const cached = await cache.get<ProjectBillingInfo>(projectCacheKey);
    if (cached) {
      return {
        workspaceId: cached.workspaceId,
        tierName: cached.tierName,
        signalRunsLimit: Number(cached.signalRunsLimit),
        resetTime: cached.resetTime,
        workspaceProjectIds: cached.workspaceProjectIds,
      };
    }
  } catch {
    // cache read failed, fall through to DB
  }

  const tierRows = await db
    .select({
      workspaceId: workspaces.id,
      signalRunsLimit: subscriptionTiers.signalRuns,
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

  const projectRows = await db.query.projects.findMany({
    where: eq(projects.workspaceId, row.workspaceId),
    columns: { id: true },
  });

  return {
    workspaceId: row.workspaceId,
    tierName: row.tierName,
    signalRunsLimit: Number(row.signalRunsLimit),
    resetTime: row.resetTime,
    workspaceProjectIds: projectRows.map((p) => p.id),
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

  const { workspaceId, tierName, signalRunsLimit, resetTime, workspaceProjectIds } = info;

  if (tierName.trim().toLowerCase() !== "free") {
    return;
  }

  if (signalRunsLimit === 0) {
    return;
  }

  const usageCacheKey = `${WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:${workspaceId}`;

  let totalSignalRuns: number | null = null;
  try {
    totalSignalRuns = await cache.get<number>(usageCacheKey);
  } catch {
    // cache read failed, fall through to ClickHouse
  }

  if (totalSignalRuns === null) {
    if (workspaceProjectIds.length === 0) {
      return;
    }

    const resetTimeDate = new Date(resetTime);
    const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
    const latestResetTimeStr = latestResetTime.toISOString().replace(/Z$/, "");

    const signalRunsQuery = `SELECT COUNT(*) as total_signal_runs
    FROM signal_runs
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { latestResetTime: DateTime(3, "UTC") }
    AND signal_runs.status = 1`;

    const result = await clickhouseClient.query({
      query: signalRunsQuery,
      format: "JSONEachRow",
      query_params: { projectIds: workspaceProjectIds, latestResetTime: latestResetTimeStr },
    });
    const rows = await result.json<{ total_signal_runs: number }>();
    totalSignalRuns = rows.length > 0 ? Number(rows[0].total_signal_runs) : 0;
  }

  if (totalSignalRuns + tracesCount > signalRunsLimit) {
    const remaining = Math.max(signalRunsLimit - totalSignalRuns, 0);
    throw new Error(
      `Signal runs limit exceeded. This job requires ${tracesCount} signal runs, but your workspace only has ${remaining} remaining out of ${signalRunsLimit} allowed this billing period. Please upgrade your plan.`
    );
  }
}
