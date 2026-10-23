import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { agents, agentVersionModels, agentVersions } from "@/lib/db/migrations/schema";

const VERSIONS_LIMIT = 50;

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

/** Agents with at least one version; one whose versions were all deferred has nothing to show yet. */
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
    .innerJoin(agentVersions, eq(agentVersions.agentId, agents.id))
    .where(eq(agents.projectId, projectId))
    .groupBy(agents.id)
    .orderBy(desc(agents.createdAt))
    .limit(100);
}

export const GetAgentVersionsSchema = z.object({
  projectId: z.guid(),
  agentId: z.guid(),
});

export interface AgentVersionItem {
  id: string;
  versionHash: string;
  versionNumber: number;
  systemPromptVersionHash: string;
  /** Static part of the system-prompt version; empty until ClickHouse has it. */
  systemPrompt: string;
  toolDefinitionsHash: string;
  /** Static part of the tool-definition version; empty without tools or until ClickHouse has it. */
  toolDefinitions: string;
  /** Models seen running this version, oldest first. */
  models: string[];
  createdAt: string;
}

export interface AgentVersionTracesPoint {
  timestamp: string;
  /** Trace count per version id. */
  [versionId: string]: number | string;
}

export interface AgentVersionsResult {
  agent: { id: string; name: string | null; agentHash: string; createdAt: string };
  versions: AgentVersionItem[];
  /** SANDBOX: daily trace counts per version. */
  traces?: AgentVersionTracesPoint[];
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
      systemPromptVersionHash: agentVersions.systemPromptVersionHash,
      toolDefinitionsHash: agentVersions.toolDefinitionsHash,
      createdAt: agentVersions.createdAt,
    })
    .from(agentVersions)
    .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.projectId, projectId)))
    .orderBy(desc(agentVersions.versionNumber))
    .limit(VERSIONS_LIMIT);

  if (versions.length === 0) return { agent, versions: [] };

  const [models, prompts, tools] = await Promise.all([
    getVersionModels(
      projectId,
      versions.map((v) => v.id)
    ),
    getStaticTexts(
      "system_prompt_version_defs",
      projectId,
      agent.agentHash,
      versions.map((v) => v.systemPromptVersionHash)
    ),
    getStaticTexts(
      "tool_definition_version_defs",
      projectId,
      agent.agentHash,
      versions.map((v) => v.toolDefinitionsHash)
    ),
  ]);

  return {
    agent,
    versions: versions.map((version) => ({
      ...version,
      systemPrompt: prompts.get(version.systemPromptVersionHash) ?? "",
      toolDefinitions: tools.get(version.toolDefinitionsHash) ?? "",
      models: models.get(version.id) ?? [],
    })),
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

async function getStaticTexts(
  table: "system_prompt_version_defs" | "tool_definition_version_defs",
  projectId: string,
  agentHash: string,
  hashes: string[]
): Promise<Map<string, string>> {
  // An empty hash is "no tools", which has no def row.
  const versionHashes = [...new Set(hashes.filter(Boolean))];
  if (versionHashes.length === 0) return new Map();
  const result = await clickhouseClient.query({
    query: `
      SELECT version_hash, static_text
      FROM ${table} FINAL
      WHERE project_id = {projectId: UUID}
        AND agent_hash = {agentHash: String}
        AND version_hash IN {versionHashes: Array(String)}
    `,
    format: "JSONEachRow",
    query_params: { projectId, agentHash, versionHashes },
  });
  const rows = await result.json<{ version_hash: string; static_text: string }>();
  return new Map(rows.map((row) => [row.version_hash, row.static_text]));
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
