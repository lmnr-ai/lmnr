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
  day: { interval: "1 HOUR", range: "24 HOUR", intervalMs: 60 * 60 * 1000 },
  week: { interval: "6 HOUR", range: "7 DAY", intervalMs: 6 * 60 * 60 * 1000 },
  month: { interval: "1 DAY", range: "30 DAY", intervalMs: 24 * 60 * 60 * 1000 },
} as const;

export async function getSignalsStats(input: z.infer<typeof GetSignalsStatsSchema>): Promise<SignalSparklineData> {
  const { projectId, signalIds, scale } = GetSignalsStatsSchema.parse(input);
  const config = SCALE_CONFIG[scale];

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
    `,
    query_params: {
      projectId,
      signalIds,
    },
    format: "JSONEachRow",
  });

  const rows = (await result.json()) as SignalStatsDataPoint[];

  // Build lookup of existing data points per signal
  const rawData = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!rawData.has(row.signal_id)) {
      rawData.set(row.signal_id, new Map());
    }
    rawData.get(row.signal_id)!.set(row.timestamp, parseInt(row.count, 10));
  }

  // Generate all time buckets for the range and fill zeros
  const now = Date.now();
  const rangeMs =
    config.range === "24 HOUR"
      ? 24 * 60 * 60 * 1000
      : config.range === "7 DAY"
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  const startTime = now - rangeMs;
  const firstBucket = Math.ceil(startTime / config.intervalMs) * config.intervalMs;

  const buckets: string[] = [];
  for (let t = firstBucket; t <= now; t += config.intervalMs) {
    const d = new Date(t);
    // Format to match ClickHouse output: "YYYY-MM-DD HH:MM:SS"
    const ts =
      d.getUTCFullYear() +
      "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getUTCDate()).padStart(2, "0") +
      " " +
      String(d.getUTCHours()).padStart(2, "0") +
      ":" +
      String(d.getUTCMinutes()).padStart(2, "0") +
      ":" +
      String(d.getUTCSeconds()).padStart(2, "0");
    buckets.push(ts);
  }

  const data: SignalSparklineData = {};
  for (const signalId of signalIds) {
    const signalCounts = rawData.get(signalId);
    data[signalId] = buckets.map((ts) => ({
      timestamp: ts,
      count: signalCounts?.get(ts) ?? 0,
    }));
  }

  return data;
}
