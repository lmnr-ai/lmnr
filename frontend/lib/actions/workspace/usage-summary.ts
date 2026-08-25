import { addMonths } from "date-fns";
import { eq } from "drizzle-orm";

import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { normalizeTier, signalTokenCostMicroUsd } from "@/lib/billing/tiers";
import {
  cache,
  WORKSPACE_BYTES_USAGE_CACHE_KEY,
  WORKSPACE_SIGNAL_CACHE_READ_TOKENS_USAGE_CACHE_KEY,
  WORKSPACE_SIGNAL_INPUT_TOKENS_USAGE_CACHE_KEY,
  WORKSPACE_SIGNAL_OUTPUT_TOKENS_USAGE_CACHE_KEY,
} from "@/lib/cache";
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
  const tier = normalizeTier(workspace.tierName);

  const resetTimeDate = new Date(workspace.resetTime);
  const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
  const latestResetTimeStr = latestResetTime.toISOString().replace(/Z$/, "");

  // --- Bytes: cache → ClickHouse fallback ---
  let totalBytesIngested = null;
  const bytesCacheKey = `${WORKSPACE_BYTES_USAGE_CACHE_KEY}:${workspaceId}`;
  try {
    const cached = await cache.get<number>(bytesCacheKey);
    totalBytesIngested = cached;
  } catch (error) {
    console.error("Error reading bytes usage from cache:", error);
  }

  // --- Signal cost: cache → ClickHouse fallback ---
  // Tokens are cached raw in three keys (input, cache-read, output priced at
  // different rates); cost in micro-USD is derived here so a rate change
  // re-prices the cache too. `totalSignalCostMicroUsd` is that derived cost.
  let signalInputTokens: number | null = null;
  let signalCacheReadTokens: number | null = null;
  let signalOutputTokens: number | null = null;
  const signalInputTokensCacheKey = `${WORKSPACE_SIGNAL_INPUT_TOKENS_USAGE_CACHE_KEY}:${workspaceId}`;
  const signalCacheReadTokensCacheKey = `${WORKSPACE_SIGNAL_CACHE_READ_TOKENS_USAGE_CACHE_KEY}:${workspaceId}`;
  const signalOutputTokensCacheKey = `${WORKSPACE_SIGNAL_OUTPUT_TOKENS_USAGE_CACHE_KEY}:${workspaceId}`;
  try {
    [signalInputTokens, signalCacheReadTokens, signalOutputTokens] = await Promise.all([
      cache.get<number>(signalInputTokensCacheKey),
      cache.get<number>(signalCacheReadTokensCacheKey),
      cache.get<number>(signalOutputTokensCacheKey),
    ]);
  } catch (error) {
    console.error("Error reading signal runs usage from cache:", error);
  }

  let totalSignalCostMicroUsd =
    signalInputTokens !== null && signalCacheReadTokens !== null && signalOutputTokens !== null
      ? signalTokenCostMicroUsd(signalInputTokens, signalCacheReadTokens, signalOutputTokens, tier)
      : null;

  // If both came from cache, return early
  if (totalBytesIngested !== null && totalSignalCostMicroUsd !== null) {
    return { totalBytesIngested, totalSignalCostMicroUsd, resetTime: latestResetTime };
  }

  // Need ClickHouse — fetch project IDs once
  const projectRows = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: { id: true },
  });

  if (projectRows.length === 0) {
    return {
      totalBytesIngested: totalBytesIngested ?? 0,
      totalSignalCostMicroUsd: totalSignalCostMicroUsd ?? 0,
      resetTime: latestResetTime,
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

  if (totalSignalCostMicroUsd === null) {
    const signalRunsQuery = `SELECT SUM(input_tokens) as inputTokens, SUM(cache_read_tokens) as cacheReadTokens, SUM(output_tokens) as outputTokens
    FROM signal_runs FINAL
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { latestResetTime: DateTime(3, "UTC") }
    AND signal_runs.status = 1`;

    const signalRunsResult = await clickhouseClient.query({
      query: signalRunsQuery,
      format: "JSONEachRow",
      query_params: { projectIds, latestResetTime: latestResetTimeStr },
    });
    const signalRunsRows = await signalRunsResult.json<{
      inputTokens: number;
      cacheReadTokens: number;
      outputTokens: number;
    }>();
    totalSignalCostMicroUsd =
      signalRunsRows.length > 0
        ? signalTokenCostMicroUsd(
            Number(signalRunsRows[0].inputTokens),
            Number(signalRunsRows[0].cacheReadTokens),
            Number(signalRunsRows[0].outputTokens),
            tier
          )
        : 0;
  }

  return { totalBytesIngested, totalSignalCostMicroUsd, resetTime: latestResetTime };
};
