import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { agents, agentVersions } from "@/lib/db/migrations/schema";

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

  const rows = await db
    .select({
      id: agents.id,
      name: agents.name,
      createdAt: agents.createdAt,
      versionCount: sql<number>`count(${agentVersions.versionHash})`.mapWith(Number),
    })
    .from(agents)
    .leftJoin(agentVersions, eq(agentVersions.agentId, agents.id))
    .where(eq(agents.projectId, projectId))
    .groupBy(agents.id)
    .orderBy(desc(agents.createdAt));

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

  const versions = await db
    .select({
      versionHash: agentVersions.versionHash,
      systemPrompt: agentVersions.systemPrompt,
      toolDefinitions: agentVersions.toolDefinitions,
      model: agentVersions.model,
      createdAt: agentVersions.createdAt,
    })
    .from(agentVersions)
    .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.projectId, projectId)))
    .orderBy(desc(agentVersions.createdAt));

  return { agent, versions };
}
