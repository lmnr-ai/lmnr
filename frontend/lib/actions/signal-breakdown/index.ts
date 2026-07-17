import { desc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { buildTimeRangeClauses } from "@/lib/actions/clusters";
import { TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { agents, agentVersions } from "@/lib/db/migrations/schema";

// Sentinel bucket ids — MUST match UNVERSIONED_ID / ENUM_NONE_ID in
// components/signal/signal-breakdown/types.ts (frontend consumer).
const UNVERSIONED_ID = "__unversioned__";

/** One time-series point, generic over the grouping bucket. */
export interface BreakdownStatsPoint {
  bucketId: string;
  timestamp: string;
  count: number;
}

const StatsBase = z.object({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  signalId: z.guid(),
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

// --- Severity (single-table GROUP BY on the severity column) ---

export const GetSeverityStatsSchema = StatsBase;

export async function getSeverityStats(
  input: z.infer<typeof GetSeverityStatsSchema>
): Promise<{ items: BreakdownStatsPoint[] }> {
  const { projectId, signalId, pastHours, startDate, endDate, intervalValue, intervalUnit } =
    GetSeverityStatsSchema.parse(input);

  const { timeClause, withFillClause, params } = buildTimeRangeClauses({
    timeColumn: "timestamp",
    pastHours,
    startTime: startDate,
    endTime: endDate,
    intervalValue,
    intervalUnit,
  });

  const query = `
    SELECT
      toString(severity) AS bucketId,
      toStartOfInterval(timestamp, toInterval({intervalValue:UInt32}, {intervalUnit:String})) AS timestamp,
      count() AS count
    FROM signal_events
    WHERE signal_id = {signalId:UUID}
      ${timeClause}
    GROUP BY bucketId, timestamp
    ORDER BY bucketId, timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<BreakdownStatsPoint>({
    query,
    parameters: { signalId, ...params },
    projectId,
  });
  return { items };
}

// --- Enum payload field (single-table GROUP BY on a JSON-extracted value) ---

export const GetEnumStatsSchema = StatsBase.extend({
  // Bound as a {field:String} param, so no SQL-injection surface.
  field: z.string().min(1),
});

export async function getEnumStats(
  input: z.infer<typeof GetEnumStatsSchema>
): Promise<{ items: BreakdownStatsPoint[] }> {
  const { projectId, signalId, field, pastHours, startDate, endDate, intervalValue, intervalUnit } =
    GetEnumStatsSchema.parse(input);

  const { timeClause, withFillClause, params } = buildTimeRangeClauses({
    timeColumn: "timestamp",
    pastHours,
    startTime: startDate,
    endTime: endDate,
    intervalValue,
    intervalUnit,
  });

  // Absent / empty field → the "__none__" sentinel so those events attribute to
  // the None bucket (matching ENUM_NONE_ID) and count toward the range total,
  // instead of a "" id that no node matches.
  const query = `
    SELECT
      coalesce(nullIf(simpleJSONExtractString(payload, {field:String}), ''), '__none__') AS bucketId,
      toStartOfInterval(timestamp, toInterval({intervalValue:UInt32}, {intervalUnit:String})) AS timestamp,
      count() AS count
    FROM signal_events
    WHERE signal_id = {signalId:UUID}
      ${timeClause}
    GROUP BY bucketId, timestamp
    ORDER BY bucketId, timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<BreakdownStatsPoint>({
    query,
    parameters: { signalId, field, ...params },
    projectId,
  });
  return { items };
}

// --- Agent version (two-view JOIN to traces.metadata; smoke-tested LAM). ---
// TODO(prototype): the `t.start_time` bound rides WHERE so `traces_v0` prunes,
// which makes the LEFT JOIN effectively inner on the time window — events whose
// trace started outside the window fall into "unversioned". Reevaluate by
// moving the join into a dedicated `signal_events_with_version_v0` view.

export const GetAgentStatsSchema = StatsBase;

export async function getAgentStats(
  input: z.infer<typeof GetAgentStatsSchema>
): Promise<{ items: BreakdownStatsPoint[] }> {
  const { projectId, signalId, pastHours, startDate, endDate, intervalValue, intervalUnit } =
    GetAgentStatsSchema.parse(input);

  // Event-time clause (WITH FILL for the interval) + a parallel trace-start
  // clause reusing the same bound params, so `traces_v0` can prune its scan.
  const event = buildTimeRangeClauses({
    timeColumn: "se.timestamp",
    pastHours,
    startTime: startDate,
    endTime: endDate,
    intervalValue,
    intervalUnit,
  });
  const trace = buildTimeRangeClauses({
    timeColumn: "t.start_time",
    pastHours,
    startTime: startDate,
    endTime: endDate,
  });

  const query = `
    SELECT
      coalesce(nullIf(simpleJSONExtractString(t.metadata, 'version_hash'), ''), '${UNVERSIONED_ID}') AS bucketId,
      toStartOfInterval(se.timestamp, toInterval({intervalValue:UInt32}, {intervalUnit:String})) AS timestamp,
      count() AS count
    FROM signal_events se
    LEFT JOIN traces t ON se.trace_id = t.id
    WHERE se.signal_id = {signalId:UUID}
      ${event.timeClause}
      ${trace.timeClause}
    GROUP BY bucketId, timestamp
    ORDER BY bucketId, timestamp ASC
    ${event.withFillClause}
  `;

  const items = await executeQuery<BreakdownStatsPoint>({
    query,
    // event/trace params are identical values under the same keys.
    parameters: { signalId, ...event.params, ...trace.params },
    projectId,
  });
  return { items };
}

// --- Agent buckets (Postgres agent → versions tree) ---

export const GetAgentBucketsSchema = z.object({
  projectId: z.guid(),
});

export interface AgentBucketVersion {
  versionHash: string;
  createdAt: string;
}

export interface AgentBucket {
  agentId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  versions: AgentBucketVersion[];
}

export async function getAgentBuckets(
  input: z.infer<typeof GetAgentBucketsSchema>
): Promise<{ agents: AgentBucket[] }> {
  const { projectId } = GetAgentBucketsSchema.parse(input);

  const rows = await db
    .select({
      agentId: agents.id,
      name: agents.name,
      agentCreatedAt: agents.createdAt,
      versionHash: agentVersions.versionHash,
      versionCreatedAt: agentVersions.createdAt,
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agentVersions.agentId, agents.id))
    .where(eq(agents.projectId, projectId))
    .orderBy(desc(agents.createdAt), desc(agentVersions.createdAt))
    .limit(500);

  const byAgent = new Map<string, AgentBucket>();
  for (const r of rows) {
    let bucket = byAgent.get(r.agentId);
    if (!bucket) {
      bucket = {
        agentId: r.agentId,
        name: r.name,
        createdAt: String(r.agentCreatedAt),
        // updated = most recent version created (rows are version-desc per agent).
        updatedAt: String(r.versionCreatedAt ?? r.agentCreatedAt),
        versions: [],
      };
      byAgent.set(r.agentId, bucket);
    }
    if (r.versionHash) {
      bucket.versions.push({ versionHash: r.versionHash, createdAt: String(r.versionCreatedAt) });
    }
  }

  return { agents: Array.from(byAgent.values()) };
}
