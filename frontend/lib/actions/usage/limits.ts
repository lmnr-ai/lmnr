import { addMonths, subHours } from "date-fns";
import { and, eq } from "drizzle-orm";

import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { normalizeTier, signalTokenCostMicroUsd } from "@/lib/billing/tiers";
import {
  cache,
  PROJECT_CACHE_KEY,
  WORKSPACE_SIGNAL_CACHE_READ_TOKENS_USAGE_CACHE_KEY,
  WORKSPACE_SIGNAL_INPUT_TOKENS_USAGE_CACHE_KEY,
  WORKSPACE_SIGNAL_OUTPUT_TOKENS_USAGE_CACHE_KEY,
} from "@/lib/cache";
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
  signalCostIncludedMicroUsd: number;
  signalCostHardLimitMicroUsd?: number | null;
}

interface BillingInfo {
  workspaceId: string;
  tierName: string;
  signalCostIncludedMicroUsd: number;
  resetTime: string;
  workspaceProjectIds: string[];
  signalCostHardLimitMicroUsd: number | null;
}

async function getProjectBillingInfo(projectId: string): Promise<BillingInfo | null> {
  const projectCacheKey = `${PROJECT_CACHE_KEY}:${projectId}`;
  try {
    const cached = await cache.get<ProjectBillingInfo>(projectCacheKey);
    if (cached) {
      return {
        workspaceId: cached.workspaceId,
        tierName: cached.tierName,
        signalCostIncludedMicroUsd: Number(cached.signalCostIncludedMicroUsd),
        resetTime: cached.resetTime,
        workspaceProjectIds: cached.workspaceProjectIds,
        signalCostHardLimitMicroUsd:
          cached.signalCostHardLimitMicroUsd != null ? Number(cached.signalCostHardLimitMicroUsd) : null,
      };
    }
  } catch {
    // cache read failed, fall through to DB
  }

  const tierRows = await db
    .select({
      workspaceId: workspaces.id,
      signalCostIncludedMicroUsd: subscriptionTiers.signalCostIncludedMicroUsd,
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
        and(eq(workspaceUsageLimits.workspaceId, row.workspaceId), eq(workspaceUsageLimits.limitType, "signal_cost"))
      )
      .limit(1),
  ]);

  return {
    workspaceId: row.workspaceId,
    tierName: row.tierName,
    signalCostIncludedMicroUsd: Number(row.signalCostIncludedMicroUsd),
    resetTime: row.resetTime,
    workspaceProjectIds: projectRows.map((p) => p.id),
    signalCostHardLimitMicroUsd: customLimitRows.length > 0 ? Number(customLimitRows[0].limitValue) : null,
  };
}

// Pre-flight budget guard run before a signal job is enqueued. Signals are
// now billed by the token cost the agent spends (micro-USD), which can't be
// known until a run completes, so we can't predict this job's cost up front.
// Instead we block only when the workspace has already exhausted its signal
// cost budget for the billing period.
export async function checkSignalRunsLimit(projectId: string): Promise<void> {
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
    signalCostIncludedMicroUsd,
    resetTime,
    workspaceProjectIds,
    signalCostHardLimitMicroUsd: customSignalCostLimit,
  } = info;
  const isFree = tierName.trim().toLowerCase() === "free";

  let effectiveLimit: number;
  if (isFree) {
    effectiveLimit = signalCostIncludedMicroUsd;
  } else {
    // For paid tiers, use the custom signal cost limit if set
    if (customSignalCostLimit == null) {
      return; // No custom limit for paid tier, no enforcement
    }
    effectiveLimit = customSignalCostLimit;
  }

  // For free tier, signalCostIncludedMicroUsd=0 means "no limit configured on this tier"
  // For custom limits (paid tiers), 0 means "block everything" so we don't skip
  if (isFree && effectiveLimit === 0) {
    return;
  }

  const inputTokensCacheKey = `${WORKSPACE_SIGNAL_INPUT_TOKENS_USAGE_CACHE_KEY}:${workspaceId}`;
  const cacheReadTokensCacheKey = `${WORKSPACE_SIGNAL_CACHE_READ_TOKENS_USAGE_CACHE_KEY}:${workspaceId}`;
  const outputTokensCacheKey = `${WORKSPACE_SIGNAL_OUTPUT_TOKENS_USAGE_CACHE_KEY}:${workspaceId}`;

  // Tokens are stored raw in three keys (input, cache-read, output priced at
  // different rates); cost in micro-USD is derived here so a rate change
  // re-prices the cache too. Fall back to ClickHouse if any key is missing.
  let inputTokens: number | null = null;
  let cacheReadTokens: number | null = null;
  let outputTokens: number | null = null;
  try {
    [inputTokens, cacheReadTokens, outputTokens] = await Promise.all([
      cache.get<number>(inputTokensCacheKey),
      cache.get<number>(cacheReadTokensCacheKey),
      cache.get<number>(outputTokensCacheKey),
    ]);
  } catch {
    // cache read failed, fall through to ClickHouse
  }

  if (inputTokens === null || cacheReadTokens === null || outputTokens === null) {
    if (workspaceProjectIds.length === 0) {
      return;
    }

    const resetTimeDate = new Date(resetTime);
    const latestResetTime = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
    const latestResetTimeStr = latestResetTime.toISOString().replace(/Z$/, "");

    const signalRunsQuery = `SELECT SUM(input_tokens) as inputTokens, SUM(cache_read_tokens) as cacheReadTokens, SUM(output_tokens) as outputTokens
    FROM signal_runs FINAL
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { latestResetTime: DateTime(3, "UTC") }
    AND signal_runs.status = 1`;

    const result = await clickhouseClient.query({
      query: signalRunsQuery,
      format: "JSONEachRow",
      query_params: { projectIds: workspaceProjectIds, latestResetTime: latestResetTimeStr },
    });
    const rows = await result.json<{ inputTokens: number; cacheReadTokens: number; outputTokens: number }>();
    inputTokens = rows.length > 0 ? Number(rows[0].inputTokens) : 0;
    cacheReadTokens = rows.length > 0 ? Number(rows[0].cacheReadTokens) : 0;
    outputTokens = rows.length > 0 ? Number(rows[0].outputTokens) : 0;
  }

  const totalSignalCost = signalTokenCostMicroUsd(inputTokens, cacheReadTokens, outputTokens, normalizeTier(tierName));

  if (totalSignalCost >= effectiveLimit) {
    const formatUsd = (microUsd: number) =>
      `$${(microUsd / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    throw new Error(
      `Signal cost limit exceeded. Your workspace has used ${formatUsd(totalSignalCost)} of the ${formatUsd(effectiveLimit)} signal budget allowed this billing period.${isFree ? " Please upgrade your plan." : ""}`
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
