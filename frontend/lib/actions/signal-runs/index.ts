import { compact } from "lodash";
import { z } from "zod/v4";

import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";

import { buildSignalRunsQueryWithParams } from "./utils";

export const GetSignalRunsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
});

export type SignalRun = {
  projectId: string;
  signalId: string;
  jobId: string;
  triggerId: string;
  runId: string;
  traceId: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "UNKNOWN";
  eventId: string;
  updatedAt: string;
  mode: "BATCH" | "REALTIME" | "UNKNOWN";
};

export type SignalRunRow = Pick<
  SignalRun,
  "jobId" | "runId" | "traceId" | "triggerId" | "status" | "eventId" | "updatedAt"
>;

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

  const items = await executeQuery<SignalRunRow>({
    query: mainQuery,
    parameters: mainParams,
    projectId,
  });

  return {
    items,
  };
};

export const GetSignalRunStatsSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
  ...TimeRangeSchema.shape,
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

export type SignalRunStatsDataPoint = { timestamp: string; count: number };

// Count of signal runs per time bucket — the population of traces this signal
// actually evaluated (post-trigger), used as the background overlay on the cluster
// frequency chart. uniqExact(run_id) dedups the ReplacingMergeTree rows within a
// bucket; a run whose rows straddle a bucket boundary (rare) may be counted twice.
export const getSignalRunStats = async (
  input: z.infer<typeof GetSignalRunStatsSchema>
): Promise<{ items: SignalRunStatsDataPoint[] }> => {
  const { projectId, signalId, pastHours, startDate, endDate, intervalValue, intervalUnit } = input;

  const {
    condition: timeCondition,
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

  const conditions = ["signal_id = {signalId:UUID}"];
  if (timeCondition) conditions.push(timeCondition);

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
      uniqExact(run_id) as count
    FROM signal_runs
    WHERE ${conditions.join(" AND ")}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<SignalRunStatsDataPoint>({
    query,
    parameters: { signalId, ...timeParams, intervalValue, intervalUnit },
    projectId,
  });

  return { items };
};
