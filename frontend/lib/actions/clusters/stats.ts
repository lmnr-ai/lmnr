import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";

export const GetClusterStatsSchema = z.object({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  signalId: z.string(),
  clusterIds: z.array(z.string()).min(1),
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

export interface ClusterStatsDataPoint {
  cluster_id: string;
  timestamp: string;
  count: number;
}

export async function getClusterStats(
  input: z.infer<typeof GetClusterStatsSchema>
): Promise<{ items: ClusterStatsDataPoint[] }> {
  const { projectId, signalId, clusterIds, pastHours, startDate, endDate, intervalValue, intervalUnit } =
    GetClusterStatsSchema.parse(input);

  const timeConditions: string[] = [];
  const params: Record<string, unknown> = {
    signalId,
    clusterIds,
    intervalValue,
    intervalUnit,
  };

  let fillFrom: string | null = null;
  let fillTo: string | null = null;

  if (pastHours && !isNaN(parseFloat(pastHours))) {
    timeConditions.push("timestamp >= now() - INTERVAL {pastHours: UInt32} HOUR");
    params.pastHours = parseInt(pastHours);
    fillFrom = `toStartOfInterval(now() - INTERVAL {pastHours:UInt32} HOUR, toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
    fillTo = `toStartOfInterval(now(), toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
  } else {
    if (startDate) {
      timeConditions.push("timestamp >= {startTime: String}");
      params.startTime = startDate.replace("Z", "");
      fillFrom = `toStartOfInterval(toDateTime64({startTime:String}, 9), toInterval({intervalValue:UInt32}, {intervalUnit:String}))`;
    }
    if (endDate) {
      timeConditions.push("timestamp <= {endTime: String}");
      params.endTime = endDate.replace("Z", "");
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

  // Uses signal_events view (via query engine) which provides the `clusters` array
  // column from the events_to_clusters join
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
    parameters: params,
    projectId,
  });

  const items: ClusterStatsDataPoint[] = rows.map((row) => ({
    cluster_id: row.cluster_id,
    timestamp: row.timestamp,
    count: parseInt(String(row.count), 10),
  }));

  return { items };
}
