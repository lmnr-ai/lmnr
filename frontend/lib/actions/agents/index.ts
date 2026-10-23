import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { agents, agentVersionModels, agentVersions } from "@/lib/db/migrations/schema";

const VERSIONS_LIMIT = 50;

// Mirror the app-server's settings of the same names; keep them equal.
const MIN_RUN = Number(process.env.AGENT_VERSIONING_MIN_RUN ?? 30);
const INTERVAL_SECONDS = Number(process.env.AGENT_VERSIONING_INTERVAL_SECONDS ?? 600);
/** Async inserts are readable within this; the job reads this far behind now (`VISIBILITY_LAG_NS`). */
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
}

/** The job mints an agent's first version from its first `needed` traces. */
export interface AgentProgress {
  traces: number;
  needed: number;
  /** Longest wait from reaching `needed` to the version: a job interval plus its read lag. */
  maxWaitMinutes: number;
}

/** Includes agents with no versions yet; their first version waits for a stable stretch. */
export async function getAgents(input: z.infer<typeof GetAgentsSchema>): Promise<AgentListItem[]> {
  const { projectId } = GetAgentsSchema.parse(input);

  return db
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
}

async function getProgress(
  projectId: string,
  agent: { agentHash: string; createdAt: string }
): Promise<AgentProgress | null> {
  const result = await clickhouseClient.query({
    query: `
      SELECT uniqExact(trace_id) AS traces
      FROM agent_prompts
      WHERE project_id = {projectId:UUID} AND agent_hash = {agentHash:String}`,
    query_params: { projectId, agentHash: agent.agentHash },
    format: "JSONEachRow",
  });
  const [row] = await result.json<{ traces: string | number }>();
  const traces = Number(row?.traces ?? 0);
  // Ingest registers an agent before its async-inserted prompts are readable, so
  // a new agent with none counted is still waiting; an old one has expired (TTL).
  const isNew = Date.now() - new Date(agent.createdAt).getTime() < VISIBILITY_LAG_SECONDS * 1000;
  if (traces === 0 && !isNew) return null;

  return {
    traces,
    needed: MIN_RUN,
    maxWaitMinutes: Math.ceil((INTERVAL_SECONDS + VISIBILITY_LAG_SECONDS) / 60),
  };
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
  /** Progress towards the first version while there is none; `null` otherwise or without recent traces. */
  progress: AgentProgress | null;
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

  if (versions.length === 0) return { agent, versions: [], progress: await getProgress(projectId, agent) };

  const models = await getVersionModels(
    projectId,
    versions.map((v) => v.id)
  );

  return {
    agent,
    versions: versions.map((version) => ({ ...version, models: models.get(version.id) ?? [] })),
    progress: null,
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
