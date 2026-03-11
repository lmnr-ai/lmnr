import { compact } from "lodash";
import { z } from "zod/v4";

import { buildTimeRangeWithFill, buildWhereClause, type QueryParams } from "@/lib/actions/common/query-builder";
import { FiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { eventsColumnFilterConfig } from "@/lib/actions/events/utils";
import { executeQuery } from "@/lib/actions/sql";

export const GetEventStatsSchema = z.object({
  ...FiltersSchema.shape,
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  signalId: z.string(),
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
  unclustered: z.coerce.boolean().optional(),
  clusterIds: z.array(z.string()).optional(),
});

export interface EventsStatsDataPoint {
  timestamp: string;
  count: number;
}

export interface ClusterStatsDataPoint {
  cluster_id: string;
  timestamp: string;
  count: number;
}

export async function getEventStats(
  input: z.infer<typeof GetEventStatsSchema>
): Promise<{ items: EventsStatsDataPoint[] } | { items: ClusterStatsDataPoint[] }> {
  const {
    projectId,
    signalId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    intervalValue,
    intervalUnit,
    filter,
    unclustered,
    clusterIds,
  } = input;

  const filters = compact(filter);

  // When clusterIds is provided, use the cluster stats query path
  if (clusterIds && clusterIds.length > 0) {
    return getClusterStatsInternal({
      projectId,
      signalId,
      clusterIds,
      pastHours,
      startTime,
      endTime,
      intervalValue,
      intervalUnit,
    });
  }

  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
  ];

  if (unclustered) {
    customConditions.push({
      condition: "empty(clusters)",
      params: {},
    });
  }

  const whereResult = buildWhereClause({
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "signal_events.timestamp",
    },
    filters,
    columnFilterConfig: eventsColumnFilterConfig,
    customConditions,
  });

  const { fillFrom, fillTo } = buildTimeRangeWithFill({
    startTime,
    endTime,
    pastHours,
    timeColumn: "signal_events.timestamp",
    intervalValue,
    intervalUnit,
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
      toStartOfInterval(timestamp, toInterval({intervalValue:UInt32}, {intervalUnit:String})) as timestamp,
      count() as count
    FROM signal_events
    ${whereResult.query}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<EventsStatsDataPoint>({
    query,
    parameters: {
      ...whereResult.parameters,
      intervalValue,
      intervalUnit,
    },
    projectId,
  });

  return { items };
}

async function getClusterStatsInternal(params: {
  projectId: string;
  signalId: string;
  clusterIds: string[];
  pastHours?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  intervalValue: number;
  intervalUnit: string;
}): Promise<{ items: ClusterStatsDataPoint[] }> {
  const { projectId, signalId, clusterIds, pastHours, startTime, endTime, intervalValue, intervalUnit } = params;

  const timeConditions: string[] = [];
  const queryParams: Record<string, unknown> = {
    signalId,
    clusterIds,
    intervalValue,
    intervalUnit,
  };

  let fillFrom: string | null = null;
  let fillTo: string | null = null;

  if (pastHours && !isNaN(parseFloat(pastHours))) {
    timeConditions.push("timestamp >= now() - INTERVAL {pastHours: UInt32} HOUR");
    queryParams.pastHours = parseInt(pastHours);
    fillFrom = `toStartOfInterval(now() - INTERVAL {pastHours:UInt32} HOUR, toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
    fillTo = `toStartOfInterval(now(), toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
  } else {
    if (startTime) {
      timeConditions.push("timestamp >= {startTime: String}");
      queryParams.startTime = startTime.replace("Z", "");
      fillFrom = `toStartOfInterval(toDateTime64({startTime:String}, 9), toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
    }
    if (endTime) {
      timeConditions.push("timestamp <= {endTime: String}");
      queryParams.endTime = endTime.replace("Z", "");
      fillTo = `toStartOfInterval(toDateTime64({endTime:String}, 9), toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
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

  const query = `
    SELECT
      cluster_id,
      toStartOfInterval(timestamp, toInterval({intervalValue: UInt32}, {intervalUnit: String})) as timestamp,
      count() as count
    FROM signal_events
    ARRAY JOIN clusters AS cluster_id
    WHERE signal_id = {signalId: UUID}
      AND has({clusterIds: Array(UUID)}, cluster_id)
      ${timeClause}
    GROUP BY cluster_id, timestamp
    ORDER BY cluster_id, timestamp ASC
    ${withFillClause}
  `;

  const rows = await executeQuery<{
    cluster_id: string;
    timestamp: string;
    count: string;
  }>({
    query,
    parameters: queryParams,
    projectId,
  });

  const items: ClusterStatsDataPoint[] = rows.map((row) => ({
    cluster_id: row.cluster_id,
    timestamp: row.timestamp,
    count: parseInt(String(row.count), 10),
  }));

  return { items };
}
