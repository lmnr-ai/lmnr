import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";

export const GetSignalsStatsSchema = z.object({
  projectId: z.string(),
  signalIds: z.array(z.string()).min(1),
  scale: z.enum(["day", "week", "month"]).default("day"),
});

export interface SignalStatsDataPoint {
  signal_id: string;
  timestamp: string;
  count: string;
}

export interface SignalSparklineData {
  [signalId: string]: { timestamp: string; count: number }[];
}

const SCALE_CONFIG = {
  day: { interval: "1 HOUR", range: "24 HOUR" },
  week: { interval: "6 HOUR", range: "7 DAY" },
  month: { interval: "1 DAY", range: "30 DAY" },
} as const;

export async function getSignalsStats(input: z.infer<typeof GetSignalsStatsSchema>): Promise<SignalSparklineData> {
  const { projectId, signalIds, scale } = GetSignalsStatsSchema.parse(input);
  const config = SCALE_CONFIG[scale];

  const fillFrom = `toStartOfInterval(now() - INTERVAL ${config.range}, INTERVAL ${config.interval})`;
  const fillTo = `toStartOfInterval(now(), INTERVAL ${config.interval})`;

  const result = await clickhouseClient.query({
    query: `
      SELECT
        signal_id,
        toStartOfInterval(timestamp, INTERVAL ${config.interval}) as timestamp,
        count() as count
      FROM signal_events
      WHERE project_id = {projectId: UUID}
        AND signal_id IN ({signalIds: Array(UUID)})
        AND timestamp >= now() - INTERVAL ${config.range}
      GROUP BY signal_id, timestamp
      ORDER BY signal_id, timestamp ASC
        WITH FILL
        FROM ${fillFrom}
        TO ${fillTo}
        STEP INTERVAL ${config.interval}
    `,
    query_params: {
      projectId,
      signalIds,
    },
    format: "JSONEachRow",
  });

  const rows = (await result.json()) as SignalStatsDataPoint[];

  // Group rows by signal_id, collecting data points per signal
  const data: SignalSparklineData = {};
  for (const signalId of signalIds) {
    data[signalId] = [];
  }

  for (const row of rows) {
    const signalId = row.signal_id;
    if (signalId in data) {
      data[signalId].push({
        timestamp: row.timestamp,
        count: parseInt(row.count, 10),
      });
    }
  }

  return data;
}
