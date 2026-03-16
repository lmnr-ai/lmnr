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

// Interval durations in milliseconds for generating fill points
const INTERVAL_MS = {
  "1 HOUR": 60 * 60 * 1000,
  "6 HOUR": 6 * 60 * 60 * 1000,
  "1 DAY": 24 * 60 * 60 * 1000,
} as const;

const RANGE_MS = {
  "24 HOUR": 24 * 60 * 60 * 1000,
  "7 DAY": 7 * 24 * 60 * 60 * 1000,
  "30 DAY": 30 * 24 * 60 * 60 * 1000,
} as const;

function floorToInterval(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

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

  // Build a lookup of actual counts per signal, keyed by floored epoch ms
  const countsBySignal = new Map<string, Map<number, number>>();
  for (const row of rows) {
    if (!countsBySignal.has(row.signal_id)) {
      countsBySignal.set(row.signal_id, new Map());
    }
    // ClickHouse returns timestamps like "2026-03-15 12:00:00" (UTC)
    const epochMs = new Date(row.timestamp.replace(" ", "T") + "Z").getTime();
    countsBySignal.get(row.signal_id)!.set(epochMs, parseInt(row.count, 10));
  }

  // Generate zero-filled time series for each signal
  const intervalMs = INTERVAL_MS[config.interval];
  const rangeMs = RANGE_MS[config.range];
  const now = Date.now();
  const fillFrom = floorToInterval(now - rangeMs, intervalMs);
  const fillTo = floorToInterval(now, intervalMs);

  const data: SignalSparklineData = {};
  for (const signalId of signalIds) {
    const signalCounts = countsBySignal.get(signalId);
    const points: { timestamp: string; count: number }[] = [];

    for (let ts = fillFrom; ts <= fillTo; ts += intervalMs) {
      const count = signalCounts?.get(ts) ?? 0;
      points.push({ timestamp: new Date(ts).toISOString(), count });
    }

    data[signalId] = points;
  }

  return data;
}
