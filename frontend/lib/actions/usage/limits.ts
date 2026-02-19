import { addMonths } from "date-fns";
import { eq } from "drizzle-orm";

import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { cache, WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export async function checkSignalRunsLimit(projectId: string, tracesCount: number): Promise<void> {
  if (!isFeatureEnabled(Feature.BILLING)) {
    return;
  }

  const tierRows = await db
    .select({
      workspaceId: workspaces.id,
      signalRunsLimit: subscriptionTiers.signalRuns,
      resetTime: workspaces.resetTime,
    })
    .from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(projects.id, projectId))
    .limit(1);

  if (tierRows.length === 0) {
    return;
  }

  const { workspaceId, signalRunsLimit, resetTime } = tierRows[0];
  const limit = Number(signalRunsLimit);

  if (limit === 0) {
    return;
  }

  const cacheKey = `${WORKSPACE_SIGNAL_RUNS_USAGE_CACHE_KEY}:${workspaceId}`;

  let totalSignalRuns: number | null = null;
  try {
    totalSignalRuns = await cache.get<number>(cacheKey);
  } catch {
    // cache read failed, fall through to ClickHouse
  }

  if (totalSignalRuns === null) {
    const resetTimeDate = new Date(resetTime);
    const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
    const latestResetTimeStr = latestResetTime.toISOString().replace(/Z$/, "");

    const projectRows = await db.query.projects.findMany({
      where: eq(projects.workspaceId, workspaceId),
      columns: { id: true },
    });

    if (projectRows.length === 0) {
      return;
    }

    const projectIds = projectRows.map((p) => p.id);

    const signalRunsQuery = `SELECT COUNT(*) as total_signal_runs
    FROM signal_runs
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { latestResetTime: DateTime(3, "UTC") }
    AND signal_runs.status = 1`;

    const result = await clickhouseClient.query({
      query: signalRunsQuery,
      format: "JSONEachRow",
      query_params: { projectIds, latestResetTime: latestResetTimeStr },
    });
    const rows = await result.json<{ total_signal_runs: number }>();
    totalSignalRuns = rows.length > 0 ? Number(rows[0].total_signal_runs) : 0;
  }

  if (totalSignalRuns + tracesCount > limit) {
    const remaining = Math.max(limit - totalSignalRuns, 0);
    throw new Error(
      `Signal runs limit exceeded. This job requires ${tracesCount} signal runs, but your workspace only has ${remaining} remaining out of ${limit} allowed this billing period. Please upgrade your plan.`
    );
  }
}
