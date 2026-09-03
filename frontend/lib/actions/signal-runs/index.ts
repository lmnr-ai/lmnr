import { eq } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { buildTimeRangeWithFill, buildWhereClause, type QueryParams } from "@/lib/actions/common/query-builder";
import { FiltersSchema, PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { normalizeTier, signalTokenCostMicroUsd } from "@/lib/billing/tiers";
import { db } from "@/lib/db/drizzle";
import { projects, subscriptionTiers, workspaces } from "@/lib/db/migrations/schema";

import { getClustersByEventIds } from "./clusters";
import {
  NON_ANALYZED_SIGNAL_RUN_STATUSES,
  type SignalRunRow,
  type SignalRunStatsDataPoint,
  type SignalRunStatus,
} from "./types";
import { buildSignalRunsQueryWithParams, signalRunsColumnFilterConfig } from "./utils";

export * from "./types";

export const GetSignalRunsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
});

export const getSignalRuns = async (input: z.infer<typeof GetSignalRunsSchema>) => {
  const { projectId, pageSize, pageNumber, pastHours, startDate, endDate, filter, signalId } = input;

  const filters = compact(filter);
  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const { query: mainQuery, parameters: mainParams } = buildSignalRunsQueryWithParams({
    signalId,
    filters,
    limit,
    offset,
    startTime: startDate,
    endTime: endDate,
    pastHours,
  });

  const [rows, tierRows] = await Promise.all([
    executeQuery<Omit<SignalRunRow, "costMicroUsd" | "clusters">>({
      query: mainQuery,
      parameters: mainParams,
      projectId,
    }),
    db
      .select({ tierName: subscriptionTiers.name })
      .from(projects)
      .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .innerJoin(subscriptionTiers, eq(workspaces.tierId, subscriptionTiers.id))
      .where(eq(projects.id, projectId))
      .limit(1),
  ]);

  // Price each run at the workspace's tier rate (Pro discounted) so the
  // displayed cost matches metered usage.
  const tier = normalizeTier(tierRows[0]?.tierName ?? "free");

  // Resolved for the fetched page only, so pagination stays a single-table scan.
  const clusters = await getClustersByEventIds({
    projectId,
    signalId,
    eventIds: rows.map((row) => row.eventId),
  });

  const items: SignalRunRow[] = rows.map((row) => ({
    ...row,
    costMicroUsd: signalTokenCostMicroUsd(
      Number(row.inputTokens),
      Number(row.cacheReadTokens),
      Number(row.outputTokens),
      tier
    ),
    clusters: clusters[row.eventId] ?? [],
  }));

  return {
    items,
  };
};

export const GetSignalRunStatsSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
  ...FiltersSchema.shape,
  ...TimeRangeSchema.shape,
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

const NIL_EVENT_ID = "00000000-0000-0000-0000-000000000000";
const IN_PROGRESS_STATUSES: SignalRunStatus[] = ["PENDING", "PROCESSING"];

const toCount = (value: unknown): number => Number(value) || 0;

// Per-bucket run counts; `count` stays analyzed-only for the cluster-chart overlay, the rest stack to all runs.
export const getSignalRunStats = async (
  input: z.infer<typeof GetSignalRunStatsSchema>
): Promise<{ items: SignalRunStatsDataPoint[] }> => {
  const { projectId, signalId, pastHours, startDate, endDate, intervalValue, intervalUnit, filter } = input;

  const filters = compact(filter);

  const {
    params: timeParams,
    fillFrom,
    fillTo,
  } = buildTimeRangeWithFill({
    startTime: startDate,
    endTime: endDate,
    pastHours,
    timeColumn: "updated_at",
    intervalValue,
    intervalUnit,
  });

  const customConditions: Array<{ condition: string; params: QueryParams }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
  ];

  const whereResult = buildWhereClause({
    timeRange: {
      startTime: startDate,
      endTime: endDate,
      pastHours,
      timeColumn: "updated_at",
    },
    filters,
    columnFilterConfig: signalRunsColumnFilterConfig,
    customConditions,
  });

  const withFillClause =
    fillFrom && fillTo
      ? `WITH FILL
    FROM ${fillFrom}
    TO ${fillTo}
    STEP toInterval({intervalValue:UInt32}, {intervalUnit:String})`
      : "";

  const query = `
    SELECT
      toStartOfInterval(updated_at, toInterval({intervalValue:UInt32}, {intervalUnit:String})) as timestamp,
      uniqExactIf(run_id, status NOT IN ({nonAnalyzedStatuses:Array(String)})) as count,
      uniqExactIf(run_id, status = 'COMPLETED' AND event_id != {nilEventId:UUID}) as eventCreated,
      uniqExactIf(run_id, status = 'COMPLETED' AND event_id = {nilEventId:UUID}) as noEvent,
      uniqExactIf(run_id, status = 'FAILED') as failed,
      uniqExactIf(run_id, status IN ({inProgressStatuses:Array(String)})) as inProgress
    FROM signal_runs
    ${whereResult.query}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const rows = await executeQuery<Record<string, unknown>>({
    query,
    parameters: {
      ...whereResult.parameters,
      ...timeParams,
      nonAnalyzedStatuses: NON_ANALYZED_SIGNAL_RUN_STATUSES,
      inProgressStatuses: IN_PROGRESS_STATUSES,
      nilEventId: NIL_EVENT_ID,
      intervalValue,
      intervalUnit,
    },
    projectId,
  });

  const items: SignalRunStatsDataPoint[] = rows.map((row) => ({
    timestamp: String(row.timestamp),
    count: toCount(row.count),
    eventCreated: toCount(row.eventCreated),
    noEvent: toCount(row.noEvent),
    failed: toCount(row.failed),
    inProgress: toCount(row.inProgress),
  }));

  return { items };
};
