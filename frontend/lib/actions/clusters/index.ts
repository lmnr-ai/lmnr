import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";

export type EventCluster = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  numChildrenClusters: number;
  numEvents: number;
  createdAt: string;
  updatedAt: string;
};

export const UNCLUSTERED_ID = "__unclustered__";

export const GetEventClustersSchema = z.object({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
});

export async function getEventClusters(
  input: z.infer<typeof GetEventClustersSchema>
): Promise<{ items: EventCluster[]; totalEventCount: number; clusteredEventCount: number }> {
  const { projectId, signalId, pastHours, startDate, endDate } = GetEventClustersSchema.parse(input);

  const { timeClause, params: timeParams } = buildTimeRangeClauses({
    timeColumn: "timestamp",
    pastHours,
    startTime: startDate,
    endTime: endDate,
  });

  const clustersQuery = `
    SELECT
      id,
      name,
      parent_id as parentId,
      level,
      num_children_clusters as numChildrenClusters,
      num_signal_events as numEvents,
      formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt,
      formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') as updatedAt
    FROM clusters
    WHERE signal_id = {signalId: UUID}
      AND level != 0
      AND id IN (
        SELECT DISTINCT cluster_id
        FROM signal_events
        ARRAY JOIN clusters AS cluster_id
        WHERE signal_id = {signalId: UUID}
          ${timeClause}
      )
    ORDER BY num_signal_events DESC, level ASC, created_at ASC
  `;

  const countQuery = `
    SELECT count() as count
    FROM signal_events
    WHERE signal_id = {signalId: UUID}
      ${timeClause}
  `;

  const unclusteredCountQuery = `
    SELECT count() as count
    FROM signal_events
    WHERE signal_id = {signalId: UUID}
      AND empty(clusters)
      ${timeClause}
  `;

  const [rows, countResult, unclusteredCountResult] = await Promise.all([
    executeQuery<{
      id: string;
      name: string;
      parentId: string | null;
      level: number;
      numChildrenClusters: number;
      numEvents: number;
      createdAt: string;
      updatedAt: string;
    }>({
      query: clustersQuery,
      parameters: { signalId, ...timeParams },
      projectId,
    }),
    executeQuery<{ count: number }>({
      query: countQuery,
      parameters: { signalId, ...timeParams },
      projectId,
    }),
    executeQuery<{ count: number }>({
      query: unclusteredCountQuery,
      parameters: { signalId, ...timeParams },
      projectId,
    }),
  ]);

  const items: EventCluster[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId && row.parentId !== "00000000-0000-0000-0000-000000000000" ? row.parentId : null,
    level: row.level,
    numChildrenClusters: row.numChildrenClusters,
    numEvents: row.numEvents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const totalEventCount = Number(countResult[0]?.count ?? 0);
  const unclusteredEventCount = Number(unclusteredCountResult[0]?.count ?? 0);
  const clusteredEventCount = totalEventCount - unclusteredEventCount;

  return { items, totalEventCount, clusteredEventCount };
}

// --- Cluster event counts (time-series) ---

export interface ClusterStatsDataPoint {
  cluster_id: string;
  timestamp: string;
  count: number;
}

export interface TimeSeriesDataPoint {
  timestamp: string;
  count: number;
}

export const GetClusterEventCountsSchema = z.object({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

interface TimeRangeClauseInput {
  timeColumn: string;
  pastHours: string | null | undefined;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  intervalValue?: number;
  intervalUnit?: "minute" | "hour" | "day";
}

interface TimeRangeClauses {
  timeClause: string;
  withFillClause: string;
  params: Record<string, unknown>;
}

const buildTimeRangeClauses = ({
  timeColumn,
  pastHours,
  startTime,
  endTime,
  intervalValue,
  intervalUnit,
}: TimeRangeClauseInput): TimeRangeClauses => {
  const timeConditions: string[] = [];
  const params: Record<string, unknown> = {};
  const withFill = intervalValue !== undefined && intervalUnit !== undefined;
  if (withFill) {
    params.intervalValue = intervalValue;
    params.intervalUnit = intervalUnit;
  }

  let fillFrom: string | null = null;
  let fillTo: string | null = null;

  if (pastHours && !isNaN(parseFloat(pastHours))) {
    timeConditions.push(`${timeColumn} >= now() - INTERVAL {pastHours: UInt32} HOUR`);
    params.pastHours = parseInt(pastHours);
    if (withFill) {
      fillFrom = `toStartOfInterval(now() - INTERVAL {pastHours:UInt32} HOUR, toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
      fillTo = `toStartOfInterval(now(), toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
    }
  } else {
    if (startTime) {
      timeConditions.push(`${timeColumn} >= {startTime: String}`);
      params.startTime = startTime.replace("Z", "");
      if (withFill) {
        fillFrom = `toStartOfInterval(toDateTime64({startTime:String}, 9), toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
      }
    }
    if (endTime) {
      timeConditions.push(`${timeColumn} <= {endTime: String}`);
      params.endTime = endTime.replace("Z", "");
      if (withFill) {
        fillTo = `toStartOfInterval(toDateTime64({endTime:String}, 9), toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
      }
    }
  }

  const timeClause = timeConditions.length > 0 ? "AND " + timeConditions.join(" AND ") : "";

  const withFillClause =
    fillFrom && fillTo
      ? `WITH FILL
    FROM ${fillFrom}
    TO ${fillTo}
    STEP toInterval({intervalValue:UInt32}, {intervalUnit:String})`
      : "";

  return { timeClause, withFillClause, params };
};

export async function getClusterEventCounts(
  input: z.infer<typeof GetClusterEventCountsSchema>
): Promise<{ items: ClusterStatsDataPoint[]; unclusteredCounts: TimeSeriesDataPoint[] }> {
  const {
    projectId,
    signalId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    intervalValue,
    intervalUnit,
  } = GetClusterEventCountsSchema.parse(input);

  const {
    timeClause,
    withFillClause,
    params: timeParams,
  } = buildTimeRangeClauses({
    timeColumn: "timestamp",
    pastHours,
    startTime,
    endTime,
    intervalValue,
    intervalUnit,
  });

  const queryParams: Record<string, unknown> = {
    signalId,
    ...timeParams,
  };

  const clusterQuery = `
    SELECT
      cluster_id,
      toStartOfInterval(timestamp, toInterval({intervalValue: UInt32}, {intervalUnit: String})) as timestamp,
      count() as count
    FROM signal_events
    ARRAY JOIN clusters AS cluster_id
    WHERE signal_id = {signalId: UUID}
      ${timeClause}
    GROUP BY cluster_id, timestamp
    ORDER BY cluster_id, timestamp ASC ${withFillClause}
  `;

  const unclusteredQuery = `
    SELECT
      toStartOfInterval(timestamp, toInterval({intervalValue: UInt32}, {intervalUnit: String})) as timestamp,
      count() as count
    FROM signal_events
    WHERE signal_id = {signalId: UUID}
      AND empty(clusters)
      ${timeClause}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const [clusterRows, unclusteredCounts] = await Promise.all([
    executeQuery<{ cluster_id: string; timestamp: string; count: number }>({
      query: clusterQuery,
      parameters: queryParams,
      projectId,
    }),
    executeQuery<{ timestamp: string; count: number }>({
      query: unclusteredQuery,
      parameters: queryParams,
      projectId,
    }),
  ]);

  return { items: clusterRows, unclusteredCounts };
}

// --- New L1+ cluster counts (time-series, by created_at) ---

export const GetNewClusterStatsSchema = z.object({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

export async function getNewClusterStats(
  input: z.infer<typeof GetNewClusterStatsSchema>
): Promise<{ items: TimeSeriesDataPoint[] }> {
  const {
    projectId,
    signalId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    intervalValue,
    intervalUnit,
  } = GetNewClusterStatsSchema.parse(input);

  const {
    timeClause,
    withFillClause,
    params: timeParams,
  } = buildTimeRangeClauses({
    timeColumn: "created_at",
    pastHours,
    startTime,
    endTime,
    intervalValue,
    intervalUnit,
  });

  const queryParams: Record<string, unknown> = {
    signalId,
    ...timeParams,
  };

  const query = `
    SELECT
      toStartOfInterval(created_at, toInterval({intervalValue:UInt32}, {intervalUnit:String})) AS timestamp,
      count() AS count
    FROM clusters
    WHERE signal_id = {signalId: UUID}
      AND level >= 1
      ${timeClause}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<TimeSeriesDataPoint>({
    query,
    parameters: queryParams,
    projectId,
  });

  return { items };
}
