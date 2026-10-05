import { addMonths } from "date-fns";
import { eq } from "drizzle-orm";

import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { signalTokenCostMicroUsd } from "@/lib/billing/tiers";
import { cache, WORKSPACE_BYTES_USAGE_CACHE_KEY } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";
import { type WorkspaceUsage } from "@/lib/workspaces/types";

export const getWorkspaceUsage = async (workspaceId: string): Promise<WorkspaceUsage> => {
  const workspaceRows = await db
    .select({ resetTime: workspaces.resetTime, tierName: subscriptionTiers.name })
    .from(workspaces)
    .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (workspaceRows.length === 0) {
    throw new Error("Workspace not found");
  }

  const workspace = workspaceRows[0];

  const resetTimeDate = new Date(workspace.resetTime);
  const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
  const latestResetTimeStr = latestResetTime.toISOString().replace(/Z$/, "");
  const signalResetTime = workspace.tierName.trim().toLowerCase() === "free" ? resetTimeDate : latestResetTime;
  const signalResetTimeStr = signalResetTime.toISOString().replace(/Z$/, "");

  // --- Bytes: cache → ClickHouse fallback ---
  let totalBytesIngested = null;
  const bytesCacheKey = `${WORKSPACE_BYTES_USAGE_CACHE_KEY}:${workspaceId}`;
  try {
    const cached = await cache.get<number>(bytesCacheKey);
    totalBytesIngested = cached;
  } catch (error) {
    console.error("Error reading bytes usage from cache:", error);
  }

  // Signal credit classification changes asynchronously in the meter job, so
  // Signals usage is read from ClickHouse rather than a long-lived cache.

  // Fetch project IDs once for ClickHouse usage queries.
  const projectRows = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: { id: true },
  });

  if (projectRows.length === 0) {
    return {
      totalBytesIngested: totalBytesIngested ?? 0,
      totalSignalCostMicroUsd: 0,
      creditedSignalCostMicroUsd: 0,
      uncreditedSignalCostMicroUsd: 0,
      resetTime: latestResetTime,
      signalResetTime,
    };
  }

  const projectIds = projectRows.map((p) => p.id);

  if (totalBytesIngested === null) {
    const bytesQuery = `WITH spans_bytes_ingested AS (
      SELECT SUM(spans.size_bytes) as spans_bytes_ingested
      FROM spans
      WHERE project_id IN { projectIds: Array(UUID) }
      AND spans.start_time >= { latestResetTime: DateTime(3, "UTC") }
    ),
    browser_session_events_bytes_ingested AS (
      SELECT SUM(browser_session_events.size_bytes) as browser_session_events_bytes_ingested
      FROM browser_session_events
      WHERE project_id IN { projectIds: Array(UUID) }
      AND browser_session_events.timestamp >= { latestResetTime: DateTime(3, "UTC") }
    )
    SELECT
      spans_bytes_ingested + browser_session_events_bytes_ingested as total_bytes_ingested
    FROM spans_bytes_ingested, browser_session_events_bytes_ingested`;

    const bytesResult = await clickhouseClient.query({
      query: bytesQuery,
      format: "JSONEachRow",
      query_params: { projectIds, latestResetTime: latestResetTimeStr },
    });
    const bytesRows = await bytesResult.json<{ total_bytes_ingested: number }>();
    totalBytesIngested = bytesRows.length > 0 ? Number(bytesRows[0].total_bytes_ingested) : 0;
  }

  const signalRunsQuery = `SELECT
      SUM(input_tokens) as inputTokens,
      SUM(cache_read_tokens) as cacheReadTokens,
      SUM(output_tokens) as outputTokens,
      SUMIf(input_tokens, credit_applied) as creditedInputTokens,
      SUMIf(cache_read_tokens, credit_applied) as creditedCacheReadTokens,
      SUMIf(output_tokens, credit_applied) as creditedOutputTokens
    FROM signal_runs FINAL
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { latestResetTime: DateTime(3, "UTC") }
    AND signal_runs.status = 1`;

  const signalRunsResult = await clickhouseClient.query({
    query: signalRunsQuery,
    format: "JSONEachRow",
    query_params: { projectIds, latestResetTime: signalResetTimeStr },
  });
  const signalRunsRows = await signalRunsResult.json<{
    inputTokens: number;
    cacheReadTokens: number;
    outputTokens: number;
    creditedInputTokens: number;
    creditedCacheReadTokens: number;
    creditedOutputTokens: number;
  }>();
  const signalRuns = signalRunsRows[0];
  const totalSignalCostMicroUsd = signalRuns
    ? signalTokenCostMicroUsd(
        Number(signalRuns.inputTokens),
        Number(signalRuns.cacheReadTokens),
        Number(signalRuns.outputTokens)
      )
    : 0;
  const creditedSignalCostMicroUsd = signalRuns
    ? signalTokenCostMicroUsd(
        Number(signalRuns.creditedInputTokens),
        Number(signalRuns.creditedCacheReadTokens),
        Number(signalRuns.creditedOutputTokens)
      )
    : 0;

  return {
    totalBytesIngested,
    totalSignalCostMicroUsd,
    creditedSignalCostMicroUsd,
    uncreditedSignalCostMicroUsd: Math.max(0, totalSignalCostMicroUsd - creditedSignalCostMicroUsd),
    resetTime: latestResetTime,
    signalResetTime,
  };
};
