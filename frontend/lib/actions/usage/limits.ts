import { addMonths, subHours } from "date-fns";
import { and, eq } from "drizzle-orm";

import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { retentionCutoff } from "@/lib/billing/retention";
import { signalTokenCostMicroUsd } from "@/lib/billing/tiers";
import { cache, PROJECT_CACHE_KEY } from "@/lib/cache";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces, workspaceUsageLimits } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

import { getSignalCreditState } from "./signal-credit";

interface ProjectBillingInfo {
  id: string;
  name: string;
  workspaceId: string;
  tierName: string;
  resetTime: string;
  workspaceProjectIds: string[];
  bytesLimit: number;
  signalCostHardLimitMicroUsd?: number | null;
}

interface BillingInfo {
  workspaceId: string;
  tierName: string;
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
    resetTime,
    workspaceProjectIds,
    signalCostHardLimitMicroUsd: customSignalCostLimit,
  } = info;
  const isFree = tierName.trim().toLowerCase() === "free";

  // Paid tiers only need this preflight path when the owner configured a
  // monthly safety cap. The meter job classifies credited runs asynchronously.
  if (!isFree && customSignalCostLimit == null) {
    return;
  }

  const resetTimeDate = new Date(resetTime);
  const signalUsageStart = isFree
    ? resetTimeDate
    : addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
  if (workspaceProjectIds.length === 0) {
    return;
  }

  const resetTimeStr = signalUsageStart.toISOString().replace(/Z$/, "");
  const signalRunsQuery = `SELECT SUM(input_tokens) as inputTokens, SUM(cache_read_tokens) as cacheReadTokens, SUM(output_tokens) as outputTokens
    FROM signal_runs FINAL
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { latestResetTime: DateTime(3, "UTC") }
    AND signal_runs.status = 1
    AND signal_runs.credit_applied = false`;

  const result = await clickhouseClient.query({
    query: signalRunsQuery,
    format: "JSONEachRow",
    query_params: { projectIds: workspaceProjectIds, latestResetTime: resetTimeStr },
  });
  const rows = await result.json<{ inputTokens: number; cacheReadTokens: number; outputTokens: number }>();
  const inputTokens = rows.length > 0 ? Number(rows[0].inputTokens) : 0;
  const cacheReadTokens = rows.length > 0 ? Number(rows[0].cacheReadTokens) : 0;
  const outputTokens = rows.length > 0 ? Number(rows[0].outputTokens) : 0;

  const totalSignalCost = signalTokenCostMicroUsd(inputTokens, cacheReadTokens, outputTokens);

  const formatUsd = (microUsd: number) =>
    `$${(microUsd / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (isFree) {
    const credit = await getSignalCreditState(workspaceId, totalSignalCost, 0);
    if (credit.remainingMicroUsd === 0) {
      throw new Error(
        `One-time Signals credit exhausted. This workspace has used its ${formatUsd(credit.grantedMicroUsd)} sign-up credit. Please upgrade your plan.`
      );
    }
    return;
  }

  const effectiveLimit = customSignalCostLimit!;
  if (totalSignalCost >= effectiveLimit) {
    throw new Error(
      `Signal cost limit exceeded. Your workspace has used ${formatUsd(totalSignalCost)} of the ${formatUsd(effectiveLimit)} signal budget allowed this billing period.`
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

  const cutoff = retentionCutoff(info.tierName);
  if (!cutoff) {
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

  if (effectiveStart < cutoff) {
    return Response.json(
      {
        error: `Forbidden.`,
      },
      { status: 403 }
    );
  }

  return null;
}
