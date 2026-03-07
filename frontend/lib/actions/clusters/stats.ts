import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types";
import { clickhouseClient } from "@/lib/clickhouse/client";

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
    projectId,
    signalId,
    clusterIds,
    intervalValue,
    intervalUnit,
  };

  if (pastHours && !isNaN(parseFloat(pastHours))) {
    timeConditions.push("se.timestamp >= now() - INTERVAL {pastHours: UInt32} HOUR");
    params.pastHours = parseInt(pastHours);
  } else {
    if (startDate) {
      timeConditions.push("se.timestamp >= {startTime: String}");
      params.startTime = startDate.replace("Z", "");
    }
    if (endDate) {
      timeConditions.push("se.timestamp <= {endTime: String}");
      params.endTime = endDate.replace("Z", "");
    }
  }

  const timeClause = timeConditions.length > 0 ? "AND " + timeConditions.join(" AND ") : "";

  const result = await clickhouseClient.query({
    query: `
      SELECT
        ec.cluster_id as cluster_id,
        toStartOfInterval(se.timestamp, toInterval({intervalValue: UInt32}, {intervalUnit: String})) as timestamp,
        count() as count
      FROM signal_events se
      INNER JOIN events_to_clusters ec ON se.id = ec.event_id AND se.project_id = ec.project_id
      WHERE se.project_id = {projectId: UUID}
        AND se.signal_id = {signalId: UUID}
        AND ec.cluster_id IN ({clusterIds: Array(UUID)})
        ${timeClause}
      GROUP BY ec.cluster_id, timestamp
      ORDER BY timestamp ASC
    `,
    query_params: params,
    format: "JSONEachRow",
  });

  const rows = (await result.json()) as Array<{
    cluster_id: string;
    timestamp: string;
    count: string;
  }>;

  const items: ClusterStatsDataPoint[] = rows.map((row) => ({
    cluster_id: row.cluster_id,
    timestamp: row.timestamp,
    count: parseInt(row.count, 10),
  }));

  return { items };
}
