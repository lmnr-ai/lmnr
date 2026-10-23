import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { type AgentVersionTracesPoint } from "@/lib/actions/agents";
import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
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

/** Traces per version per time bucket, keyed by Postgres `agent_versions.id`. */
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

  const {
    condition: timeCondition,
    params: timeParams,
    fillFrom,
    fillTo,
  } = buildTimeRangeWithFill({ startTime: startDate, endTime: endDate, pastHours, intervalValue, intervalUnit });

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

  const rows = await executeQuery<TracesBucketRow>({
    query,
    parameters: { ...timeParams, agentHash: agent.agentHash, intervalValue, intervalUnit },
    projectId,
  });

  return rows.map(({ timestamp, versionHashes, counts }) => {
    // ClickHouse returns UTC without an offset; ISO keeps the chart's zoom range unambiguous.
    const point: AgentVersionTracesPoint = { timestamp: new Date(`${timestamp.replace(" ", "T")}Z`).toISOString() };
    versionHashes.forEach((hash, i) => {
      const id = idByHash.get(hash);
      if (id) point[id] = Number(counts[i]);
    });
    return point;
  });
}
