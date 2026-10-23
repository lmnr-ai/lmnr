import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { agents, agentVersionModels, agentVersions } from "@/lib/db/migrations/schema";

const VERSIONS_LIMIT = 50;

// Mirror the app-server's settings of the same names; keep them equal.
const MIN_RUN = Number(process.env.AGENT_VERSIONING_MIN_RUN ?? 30);
const ROLLOUT_WINDOW_SECONDS = Number(process.env.AGENT_VERSIONING_ROLLOUT_WINDOW_SECONDS ?? 600);
const INTERVAL_SECONDS = Number(process.env.AGENT_VERSIONING_INTERVAL_SECONDS ?? 600);
/** The job reads 2 minutes behind now (`VISIBILITY_LAG_NS`). */
const VISIBILITY_LAG_SECONDS = 2 * 60;

export const GetAgentsSchema = z.object({
  projectId: z.guid(),
});

export interface AgentListItem {
  id: string;
  /** `null` until generated or set by a user. */
  name: string | null;
  agentHash: string;
  createdAt: string;
  versionCount: number;
  /** Progress towards the first version; `null` once the agent has one. */
  progress: AgentProgress | null;
}

/**
 * The job mints an agent's first version once `needed` traces start more than a rollout window after
 * its first trace, so a rollout in progress is never taken for a version.
 */
export interface AgentProgress {
  /** When traces start counting: the first trace's start plus the rollout window. */
  countingFrom: string;
  /** Traces whose first prompt starts after `countingFrom`. */
  traces: number;
  needed: number;
  rolloutWindowMinutes: number;
  /** Longest wait from reaching `needed` to the version: a job interval plus its read lag. */
  maxWaitMinutes: number;
}

/** Includes agents with no versions yet; their first version waits for a stable stretch. */
export async function getAgents(input: z.infer<typeof GetAgentsSchema>): Promise<AgentListItem[]> {
  const { projectId } = GetAgentsSchema.parse(input);

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      agentHash: agents.agentHash,
      createdAt: agents.createdAt,
      versionCount: count(agentVersions.id),
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agentVersions.agentId, agents.id))
    .where(eq(agents.projectId, projectId))
    .groupBy(agents.id)
    .orderBy(desc(agents.createdAt))
    .limit(100);

  const progress = await getProgress(
    projectId,
    rows.filter((row) => row.versionCount === 0).map((row) => row.agentHash)
  );

  return rows.map((row) => ({
    ...row,
    progress: row.versionCount === 0 ? (progress.get(row.agentHash) ?? null) : null,
  }));
}

/** Counts traces the way the job's samples do: a trace's time is its first prompt's start. */
async function getProgress(projectId: string, agentHashes: string[]): Promise<Map<string, AgentProgress>> {
  if (agentHashes.length === 0) return new Map();

  const result = await clickhouseClient.query({
    query: `
      SELECT agent_hash, toUnixTimestamp64Milli(counting_from) AS counting_from_ms, countIf(time > counting_from) AS traces
      FROM (
        SELECT agent_hash, time, min(time) OVER (PARTITION BY agent_hash) + toIntervalSecond({window:UInt32}) AS counting_from
        FROM (
          SELECT agent_hash, trace_id, min(start_time) AS time
          FROM agent_prompts
          WHERE project_id = {projectId:UUID} AND agent_hash IN {agentHashes:Array(String)}
          GROUP BY agent_hash, trace_id
        )
      )
      GROUP BY agent_hash, counting_from`,
    query_params: { projectId, agentHashes, window: ROLLOUT_WINDOW_SECONDS },
    format: "JSONEachRow",
  });
  const rows = await result.json<{ agent_hash: string; counting_from_ms: string | number; traces: string | number }>();

  const maxWaitMinutes = Math.ceil((INTERVAL_SECONDS + VISIBILITY_LAG_SECONDS) / 60);
  return new Map(
    rows.map((row) => [
      row.agent_hash,
      {
        countingFrom: new Date(Number(row.counting_from_ms)).toISOString(),
        traces: Number(row.traces),
        needed: MIN_RUN,
        rolloutWindowMinutes: ROLLOUT_WINDOW_SECONDS / 60,
        maxWaitMinutes,
      },
    ])
  );
}

export const GetAgentVersionsSchema = z.object({
  projectId: z.guid(),
  agentId: z.guid(),
});

export interface AgentVersionItem {
  id: string;
  versionHash: string;
  versionNumber: number;
  /** The version's stable lines of system prompt and tools, in document order. */
  text: string;
  /** Models seen running this version, oldest first. */
  models: string[];
  createdAt: string;
}

export interface AgentVersionsResult {
  agent: { id: string; name: string | null; agentHash: string; createdAt: string };
  versions: AgentVersionItem[];
}

export async function getAgentVersions(
  input: z.infer<typeof GetAgentVersionsSchema>
): Promise<AgentVersionsResult | null> {
  const { projectId, agentId } = GetAgentVersionsSchema.parse(input);

  const [agent] = await db
    .select({ id: agents.id, name: agents.name, agentHash: agents.agentHash, createdAt: agents.createdAt })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
    .limit(1);

  if (!agent) return null;

  const versions = await db
    .select({
      id: agentVersions.id,
      versionHash: agentVersions.versionHash,
      versionNumber: agentVersions.versionNumber,
      text: agentVersions.text,
      createdAt: agentVersions.createdAt,
    })
    .from(agentVersions)
    .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.projectId, projectId)))
    .orderBy(desc(agentVersions.versionNumber))
    .limit(VERSIONS_LIMIT);

  if (versions.length === 0) return { agent, versions: [] };

  const models = await getVersionModels(
    projectId,
    versions.map((v) => v.id)
  );

  return {
    agent,
    versions: versions.map((version) => ({ ...version, models: models.get(version.id) ?? [] })),
  };
}

async function getVersionModels(projectId: string, versionIds: string[]): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ agentVersionId: agentVersionModels.agentVersionId, model: agentVersionModels.model })
    .from(agentVersionModels)
    .where(and(eq(agentVersionModels.projectId, projectId), inArray(agentVersionModels.agentVersionId, versionIds)))
    .orderBy(asc(agentVersionModels.createdAt));

  const models = new Map<string, string[]>();
  for (const row of rows) {
    models.set(row.agentVersionId, [...(models.get(row.agentVersionId) ?? []), row.model]);
  }
  return models;
}

export const RenameAgentSchema = z.object({
  projectId: z.guid(),
  agentId: z.guid(),
  name: z.string().trim().min(1, "Name is required").max(100),
});

export async function renameAgent(
  input: z.infer<typeof RenameAgentSchema>
): Promise<{ id: string; name: string | null } | null> {
  const { projectId, agentId, name } = RenameAgentSchema.parse(input);

  const [agent] = await db
    .update(agents)
    .set({ name })
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
    .returning({ id: agents.id, name: agents.name });

  return agent ?? null;
}
