import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { agentReleases, agents, agentVersionModels, agentVersions } from "@/lib/db/migrations/schema";

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
    .orderBy(desc(count(agentVersions.id)), desc(agents.createdAt))
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
  /** The system prompt's lines shared by every trace of the version. */
  systemPrompt: string;
  /** The same for the tools, as app-server `tool_text::render` writes them; empty without tools. */
  toolDefinitions: string;
  /** Models seen running this version, oldest first. */
  models: string[];
  /** SDK releases (git SHAs) grouped into this version, newest first; empty for inferred versions. */
  releases: string[];
  createdAt: string;
}

export interface AgentVersionTracesPoint {
  timestamp: string;
  /** Trace count per version id, plus `UNVERSIONED_KEY` from `./types`. */
  [versionId: string]: number | string;
}

export interface AgentVersionsResult {
  agent: {
    id: string;
    name: string | null;
    agentHash: string;
    createdAt: string;
    /** Versioned by SDK releases; set once most recent traces carry `LMNR_RELEASE`. */
    releaseMode: boolean;
  };
  versions: AgentVersionItem[];
}

export async function getAgentVersions(
  input: z.infer<typeof GetAgentVersionsSchema>
): Promise<AgentVersionsResult | null> {
  const { projectId, agentId } = GetAgentVersionsSchema.parse(input);

  const [agent] = await db
    .select({
      id: agents.id,
      name: agents.name,
      agentHash: agents.agentHash,
      createdAt: agents.createdAt,
      releaseMode: agents.releaseMode,
    })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
    .limit(1);

  if (!agent) return null;

  const versions = await db
    .select({
      id: agentVersions.id,
      versionHash: agentVersions.versionHash,
      versionNumber: agentVersions.versionNumber,
      systemPrompt: agentVersions.systemPrompt,
      toolDefinitions: agentVersions.toolDefinitions,
      createdAt: agentVersions.createdAt,
    })
    .from(agentVersions)
    .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.projectId, projectId)))
    .orderBy(desc(agentVersions.versionNumber))
    .limit(VERSIONS_LIMIT);

  if (versions.length === 0) return { agent, versions: [] };

  const versionIds = versions.map((v) => v.id);
  const [models, releases] = await Promise.all([
    getVersionModels(projectId, versionIds),
    getVersionReleases(projectId, versionIds),
  ]);

  return {
    agent,
    versions: versions.map((version) => ({
      ...version,
      models: models.get(version.id) ?? [],
      releases: releases.get(version.id) ?? [],
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

async function getVersionReleases(projectId: string, versionIds: string[]): Promise<Map<string, string[]>> {
  const rows = await db
    .select({ versionId: agentReleases.versionId, release: agentReleases.release })
    .from(agentReleases)
    .where(and(eq(agentReleases.projectId, projectId), inArray(agentReleases.versionId, versionIds)))
    .orderBy(desc(agentReleases.firstSeen));

  const releases = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.versionId) continue;
    releases.set(row.versionId, [...(releases.get(row.versionId) ?? []), row.release]);
  }
  return releases;
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
