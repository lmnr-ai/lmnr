import { addMonths } from "date-fns";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { completeMonthsElapsed } from "@/lib/actions/workspaces/utils";
import { signalTokenCostMicroUsd } from "@/lib/billing/tiers";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { projects, workspaces } from "@/lib/db/migrations/schema";

import { type UsageBreakdown, type UsageDay } from "./types";

const GetUsageBreakdownSchema = z.object({
  workspaceId: z.string(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

interface BytesRow {
  date: string;
  bytes: string | number;
  compressedBytes: string | number;
}

interface SignalRow {
  date: string;
  runs: string | number;
  inputTokens: string | number;
  cacheReadTokens: string | number;
  outputTokens: string | number;
}

// Same sources and filters as the `getWorkspaceUsage` ClickHouse fallback, so days sum to its totals.
export async function getUsageBreakdown(input: z.infer<typeof GetUsageBreakdownSchema>): Promise<UsageBreakdown> {
  const { workspaceId } = GetUsageBreakdownSchema.parse(input);

  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin", "member"] });

  const [workspace] = await db
    .select({ resetTime: workspaces.resetTime })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const resetTimeDate = new Date(workspace.resetTime);
  const cycleStart = addMonths(resetTimeDate, completeMonthsElapsed(resetTimeDate, new Date()));
  const cycleStartStr = cycleStart.toISOString().replace(/Z$/, "");

  const projectRows = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    columns: { id: true },
  });
  const projectIds = projectRows.map((p) => p.id);

  const [bytesRows, signalRows] =
    projectIds.length === 0
      ? [[], []]
      : await Promise.all([queryDailyBytes(projectIds, cycleStartStr), queryDailySignals(projectIds, cycleStartStr)]);

  const byDate = new Map<string, UsageDay>();
  const today = new Date().toISOString().slice(0, 10);
  for (let t = Date.parse(`${cycleStart.toISOString().slice(0, 10)}T00:00:00Z`); ; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    byDate.set(date, { date, bytes: 0, compressedBytes: 0, signalCostMicroUsd: 0, signalRuns: 0 });
    if (date >= today) break;
  }

  for (const row of bytesRows) {
    const day = byDate.get(row.date);
    if (!day) continue;
    day.bytes += Number(row.bytes);
    // Tiny messages can net negative: a 32B hash outweighs the message it replaces.
    day.compressedBytes += Math.max(Number(row.compressedBytes), 0);
  }

  let signalRuns = 0;
  for (const row of signalRows) {
    const day = byDate.get(row.date);
    if (day) {
      day.signalRuns += Number(row.runs);
      day.signalCostMicroUsd += signalTokenCostMicroUsd(
        Number(row.inputTokens),
        Number(row.cacheReadTokens),
        Number(row.outputTokens)
      );
    }
    signalRuns += Number(row.runs);
  }

  return {
    cycleStart: cycleStart.toISOString(),
    days: Array.from(byDate.values()),
    signalRuns,
  };
}

async function queryDailyBytes(projectIds: string[], cycleStart: string): Promise<BytesRow[]> {
  const result = await clickhouseClient.query({
    query: `SELECT date, SUM(bytes) AS bytes, SUM(compressedBytes) AS compressedBytes FROM (
      SELECT
        toString(toDate(start_time, 'UTC')) AS date,
        SUM(size_bytes) AS bytes,
        -- rows written before original_size_bytes existed read back 0
        SUMIf(toInt64(original_size_bytes) - toInt64(size_bytes), original_size_bytes > 0) AS compressedBytes
      FROM spans
      WHERE project_id IN { projectIds: Array(UUID) }
      AND start_time >= { cycleStart: DateTime(3, "UTC") }
      GROUP BY date
      UNION ALL
      SELECT toString(toDate(timestamp, 'UTC')) AS date, SUM(size_bytes) AS bytes, toInt64(0) AS compressedBytes
      FROM browser_session_events
      WHERE project_id IN { projectIds: Array(UUID) }
      AND timestamp >= { cycleStart: DateTime(3, "UTC") }
      GROUP BY date
    )
    GROUP BY date`,
    format: "JSONEachRow",
    query_params: { projectIds, cycleStart },
  });
  return result.json<BytesRow>();
}

async function queryDailySignals(projectIds: string[], cycleStart: string): Promise<SignalRow[]> {
  const result = await clickhouseClient.query({
    query: `SELECT
      toString(toDate(updated_at, 'UTC')) AS date,
      count() AS runs,
      SUM(input_tokens) AS inputTokens,
      SUM(cache_read_tokens) AS cacheReadTokens,
      SUM(output_tokens) AS outputTokens
    FROM signal_runs FINAL
    WHERE project_id IN { projectIds: Array(UUID) }
    AND signal_runs.updated_at >= { cycleStart: DateTime(3, "UTC") }
    AND signal_runs.status = 1
    GROUP BY date`,
    format: "JSONEachRow",
    query_params: { projectIds, cycleStart },
  });
  return result.json<SignalRow>();
}
