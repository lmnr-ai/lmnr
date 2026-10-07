import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export const GetSignalsStatsSchema = z.object({
  projectId: z.guid(),
  signalIds: z.array(z.string()).min(1),
  pastHours: z.coerce.number().positive(),
});

export interface SignalStatsDataPoint {
  signal_id: string;
  timestamp: string;
  count: string;
}

export interface SignalSparklineData {
  [signalId: string]: { timestamp: string; count: number }[];
}

function getIntervalForHours(hours: number): { interval: string; intervalMs: number } {
  if (hours <= 1) return { interval: "1 MINUTE", intervalMs: 60_000 };
  if (hours <= 3) return { interval: "5 MINUTE", intervalMs: 5 * 60_000 };
  if (hours <= 24) return { interval: "1 HOUR", intervalMs: 3_600_000 };
  if (hours <= 72) return { interval: "3 HOUR", intervalMs: 3 * 3_600_000 };
  if (hours <= 168) return { interval: "6 HOUR", intervalMs: 6 * 3_600_000 };
  if (hours <= 336) return { interval: "12 HOUR", intervalMs: 12 * 3_600_000 };
  return { interval: "1 DAY", intervalMs: 86_400_000 };
}

function floorToInterval(ts: number, intervalMs: number): number {
  return Math.floor(ts / intervalMs) * intervalMs;
}

export async function getSignalsStats(input: z.infer<typeof GetSignalsStatsSchema>): Promise<SignalSparklineData> {
  const { projectId, signalIds, pastHours } = GetSignalsStatsSchema.parse(input);
  const { interval, intervalMs } = getIntervalForHours(pastHours);
  const rangeMs = pastHours * 3_600_000;

  const rows = await executeQuery<SignalStatsDataPoint>({
    projectId,
    query: `
      SELECT
        signal_id,
        toStartOfInterval(timestamp, INTERVAL ${interval}) as timestamp,
        count() as count
      FROM signal_events
      WHERE signal_id IN ({signalIds: Array(UUID)})
        AND timestamp >= now() - INTERVAL ${pastHours} HOUR
      GROUP BY signal_id, timestamp
      ORDER BY signal_id, timestamp ASC
    `,
    parameters: { signalIds },
  });

  const countsBySignal = new Map<string, Map<number, number>>();
  for (const row of rows) {
    if (!countsBySignal.has(row.signal_id)) {
      countsBySignal.set(row.signal_id, new Map());
    }
    const epochMs = new Date(row.timestamp.replace(" ", "T") + "Z").getTime();
    countsBySignal.get(row.signal_id)!.set(epochMs, parseInt(row.count, 10));
  }

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
