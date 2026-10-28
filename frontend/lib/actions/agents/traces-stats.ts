import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { type AgentVersionTracesPoint } from "@/lib/actions/agents";
import { UNVERSIONED_KEY } from "@/lib/actions/agents/types";
import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { agents, agentVersions } from "@/lib/db/migrations/schema";

const DEFAULT_PAST_HOURS = "168";

export const GetAgentTracesStatsSchema = TimeRangeSchema.extend({
  projectId: z.guid(),
  agentId: z.guid(),
  intervalValue: z.coerce.number().int().positive().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("day"),
});

interface TracesBucketRow {
  timestamp: string;
  versionHashes: string[];
  counts: number[];
}

interface UnversionedBucketRow {
  /** Unix seconds. */
  timestamp: number;
  /** UInt64, quoted unless the server disables `output_format_json_quote_64bit_integers`. */
  traces: number | string;
}

/** Traces per version per time bucket, keyed by Postgres `agent_versions.id`, plus unversioned ones. */
export async function getAgentTracesStats(
  input: z.infer<typeof GetAgentTracesStatsSchema>
): Promise<AgentVersionTracesPoint[] | null> {
  const { projectId, agentId, startDate, endDate, intervalValue, intervalUnit, ...range } =
    GetAgentTracesStatsSchema.parse(input);
  const pastHours = range.pastHours ?? (startDate ? undefined : DEFAULT_PAST_HOURS);

  const [agent] = await db
    .select({ agentHash: agents.agentHash })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
    .limit(1);
  if (!agent) return null;

  const versions = await db
    .select({ id: agentVersions.id, versionHash: agentVersions.versionHash })
    .from(agentVersions)
    .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.projectId, projectId)));
  const idByHash = new Map(versions.map((v) => [v.versionHash, v.id]));

  const timeRange = buildTimeRangeWithFill({
    startTime: startDate,
    endTime: endDate,
    pastHours,
    intervalValue,
    intervalUnit,
  });
  const { condition: timeCondition, params: timeParams, fillFrom, fillTo } = timeRange;

  const conditions = ["tupleElement(v, 'agent_hash') = {agentHash:String}", ...(timeCondition ? [timeCondition] : [])];
  const withFill =
    fillFrom && fillTo
      ? `WITH FILL FROM ${fillFrom} TO ${fillTo} STEP toInterval({intervalValue:UInt32}, {intervalUnit:String})`
      : "";

  // A trace carries one tuple per model, so traces are counted distinct per version.
  const query = `
    SELECT timestamp, groupArray(version_hash) AS versionHashes, groupArray(traces) AS counts
    FROM (
      SELECT
        toStartOfInterval(start_time, toInterval({intervalValue:UInt32}, {intervalUnit:String})) AS timestamp,
        tupleElement(v, 'version_hash') AS version_hash,
        uniqExact(id) AS traces
      FROM traces
      ARRAY JOIN agent_versions AS v
      WHERE ${conditions.join(" AND ")}
      GROUP BY timestamp, version_hash
    )
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFill}
  `;

  const params = { ...timeParams, agentHash: agent.agentHash, intervalValue, intervalUnit };
  const [rows, unversioned] = await Promise.all([
    executeQuery<TracesBucketRow>({ query, parameters: params, projectId }),
    getUnversionedTraces({ projectId, params, timeCondition, fillFrom }),
  ]);

  const points = rows.map(({ timestamp, versionHashes, counts }) => {
    // ClickHouse returns UTC without an offset; ISO keeps the chart's zoom range unambiguous.
    const point: AgentVersionTracesPoint = { timestamp: new Date(`${timestamp.replace(" ", "T")}Z`).toISOString() };
    versionHashes.forEach((hash, i) => {
      const id = idByHash.get(hash);
      if (id) point[id] = Number(counts[i]);
    });
    return point;
  });

  const byTimestamp = new Map(points.map((p) => [p.timestamp, p]));
  for (const [timestamp, traces] of unversioned) {
    const point = byTimestamp.get(timestamp);
    if (point) point[UNVERSIONED_KEY] = traces;
    else points.push({ timestamp, [UNVERSIONED_KEY]: traces });
  }
  return points.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Traces of the agent with no version tag of it, by ISO bucket. Read straight from ClickHouse: `agent_prompts`
 * isn't in the SQL editor schema, and its 7-day TTL bounds how far back these counts go.
 */
async function getUnversionedTraces({
  projectId,
  params,
  timeCondition,
  fillFrom,
}: {
  projectId: string;
  params: Record<string, unknown>;
  timeCondition: string | null;
  fillFrom: string | null;
}): Promise<Map<string, number>> {
  // A version tag is stamped with the trace's start, which precedes its agent span's.
  const tagsFrom = fillFrom ? `AND start_time >= ${fillFrom} - INTERVAL 1 DAY` : "";
  const result = await clickhouseClient.query({
    query: `
      SELECT
        toUnixTimestamp(toStartOfInterval(time, toInterval({intervalValue:UInt32}, {intervalUnit:String}))) AS timestamp,
        count() AS traces
      FROM (
        SELECT trace_id, min(start_time) AS time
        FROM agent_prompts
        WHERE project_id = {projectId:UUID} AND agent_hash = {agentHash:String}
          ${timeCondition ? `AND ${timeCondition}` : ""}
        GROUP BY trace_id
      )
      WHERE trace_id NOT IN (
        SELECT id FROM traces_agg
        WHERE project_id = {projectId:UUID} ${tagsFrom}
          AND arrayExists(v -> tupleElement(v, 'agent_hash') = {agentHash:String}, agent_versions)
      )
      GROUP BY timestamp
    `,
    query_params: { ...params, projectId },
    format: "JSONEachRow",
  });

  const rows = (await result.json()) as UnversionedBucketRow[];
  return new Map(rows.map((row) => [new Date(row.timestamp * 1000).toISOString(), Number(row.traces)]));
}
