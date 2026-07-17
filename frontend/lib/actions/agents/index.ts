import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { agents, agentVersions } from "@/lib/db/migrations/schema";

// Lookback for the per-version "Last trace" column. Bounded so the traces_v0
// scan is pruned (the view is partitioned by month on start_time); a version
// with no trace in this window shows no last-trace. TODO(prototype): a
// denormalised last-trace on agent_versions would remove the bound.
const LAST_TRACE_LOOKBACK_HOURS = 720;

export const GetAgentsSchema = z.object({
  projectId: z.guid(),
});

export interface AgentListItem {
  id: string;
  name: string;
  createdAt: string;
  versionCount: number;
}

export async function getAgents(input: z.infer<typeof GetAgentsSchema>): Promise<AgentListItem[]> {
  const { projectId } = GetAgentsSchema.parse(input);

  const topAgents = db
    .select({ id: agents.id, name: agents.name, createdAt: agents.createdAt })
    .from(agents)
    .where(eq(agents.projectId, projectId))
    .orderBy(desc(agents.createdAt))
    .limit(20)
    .as("top_agents");

  const rows = await db
    .select({
      id: topAgents.id,
      name: topAgents.name,
      createdAt: topAgents.createdAt,
      versionCount: sql<number>`count(${agentVersions.versionHash})`.mapWith(Number),
    })
    .from(topAgents)
    .leftJoin(agentVersions, eq(agentVersions.agentId, topAgents.id))
    .groupBy(topAgents.id, topAgents.name, topAgents.createdAt)
    .orderBy(desc(topAgents.createdAt))
    .limit(100);

  return rows;
}

export const GetAgentVersionsSchema = z.object({
  projectId: z.guid(),
  agentId: z.guid(),
});

export interface AgentVersionItem {
  versionHash: string;
  systemPrompt: string;
  toolDefinitions: string;
  model: string;
  createdAt: string;
  /** Most recent trace tagged with this version in the lookback window, if any. */
  lastTraceId: string | null;
  lastTraceAt: string | null;
}

export interface AgentVersionsResult {
  agent: { id: string; name: string; createdAt: string };
  versions: AgentVersionItem[];
}

export async function getAgentVersions(
  input: z.infer<typeof GetAgentVersionsSchema>
): Promise<AgentVersionsResult | null> {
  const { projectId, agentId } = GetAgentVersionsSchema.parse(input);

  const [agent] = await db
    .select({ id: agents.id, name: agents.name, createdAt: agents.createdAt })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
    .limit(1);

  if (!agent) return null;

  const versionRows = await db
    .select({
      versionHash: agentVersions.versionHash,
      systemPrompt: agentVersions.systemPrompt,
      toolDefinitions: agentVersions.toolDefinitions,
      model: agentVersions.model,
      createdAt: agentVersions.createdAt,
    })
    .from(agentVersions)
    .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.projectId, projectId)))
    .orderBy(desc(agentVersions.createdAt))
    .limit(50);

  const lastTraceByHash = await getLastTraceByVersion(
    projectId,
    versionRows.map((v) => v.versionHash)
  );

  const versions: AgentVersionItem[] = versionRows.map((v) => ({
    ...v,
    createdAt: String(v.createdAt),
    lastTraceId: lastTraceByHash.get(v.versionHash)?.id ?? null,
    lastTraceAt: lastTraceByHash.get(v.versionHash)?.at ?? null,
  }));

  return { agent, versions };
}

/** Most-recent trace id + time per version_hash, from traces.metadata (bounded). */
async function getLastTraceByVersion(
  projectId: string,
  versionHashes: string[]
): Promise<Map<string, { id: string; at: string }>> {
  const result = new Map<string, { id: string; at: string }>();
  if (versionHashes.length === 0) return result;

  const rows = await executeQuery<{ versionHash: string; lastTraceId: string; lastTraceAt: string }>({
    query: `
      SELECT
        simpleJSONExtractString(metadata, 'version_hash') AS versionHash,
        argMax(id, start_time) AS lastTraceId,
        formatDateTime(max(start_time), '%Y-%m-%dT%H:%i:%S.%fZ') AS lastTraceAt
      FROM traces
      WHERE start_time >= now() - INTERVAL {lookbackHours:UInt32} HOUR
        AND simpleJSONExtractString(metadata, 'version_hash') IN {versionHashes:Array(String)}
      GROUP BY versionHash
    `,
    parameters: { lookbackHours: LAST_TRACE_LOOKBACK_HOURS, versionHashes },
    projectId,
  }).catch(() => []);

  for (const r of rows) {
    if (r.versionHash) result.set(r.versionHash, { id: r.lastTraceId, at: r.lastTraceAt });
  }
  return result;
}
