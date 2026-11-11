import { and, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { ApiError, NotFoundError } from "@/lib/api/errors";
import { AGENT_DEFINITIONS_CACHE_KEY, cache } from "@/lib/cache";
import { db } from "@/lib/db/drizzle";
import { agents } from "@/lib/db/migrations/schema";

/** app-server `agent_versioning::Definition`: a rule matches when all its substrings do. */
export const AgentDefinitionSchema = z.object({ any_of: z.array(z.array(z.string())) });

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>;

// Mirrors app-server `definition::normalize`, so stored rules read the same as detection's.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\uFFFE\uFFFF]/g;

function normalize(substring: string): string {
  return substring.replace(CONTROL_CHARS, "").trim().split(/\s+/).join(" ").toLowerCase();
}

export const AgentRuleSchema = z.object({
  projectId: z.guid(),
  agentId: z.guid(),
  substrings: z.array(z.string()).min(1),
});

/** Appends the rule unless the definition already has it. */
export async function addAgentRule(input: z.infer<typeof AgentRuleSchema>): Promise<AgentDefinition> {
  const { projectId, agentId, substrings } = AgentRuleSchema.parse(input);
  const rule = substrings.map(normalize).filter(Boolean);
  if (rule.length === 0) throw new ApiError("A rule needs at least one non-empty phrase", 400);

  const ruleJson = JSON.stringify(rule);
  const anyOf = sql`COALESCE(${agents.definition} -> 'any_of', '[]'::jsonb)`;
  const [row] = await db
    .update(agents)
    .set({
      definition: sql`jsonb_set(COALESCE(${agents.definition}, '{}'::jsonb), '{any_of}', ${anyOf} || CASE
        WHEN ${ruleJson}::jsonb IN (SELECT jsonb_array_elements(${anyOf})) THEN '[]'::jsonb
        ELSE jsonb_build_array(${ruleJson}::jsonb)
      END)`,
    })
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
    .returning({ definition: agents.definition });

  if (!row) throw new NotFoundError("Agent not found");
  await invalidateDefinitions(projectId);
  return AgentDefinitionSchema.parse(row.definition);
}

/** Removes the rule as stored; the last rule is kept, since an agent without rules matches nothing. */
export async function removeAgentRule(input: z.infer<typeof AgentRuleSchema>): Promise<AgentDefinition> {
  const { projectId, agentId, substrings } = AgentRuleSchema.parse(input);

  const ruleJson = JSON.stringify(substrings);
  const others = sql`jsonb_array_elements(${agents.definition} -> 'any_of') WITH ORDINALITY AS e(rule, i)
    WHERE e.rule <> ${ruleJson}::jsonb`;
  const [row] = await db
    .update(agents)
    .set({
      definition: sql`jsonb_set(${agents.definition}, '{any_of}', (SELECT jsonb_agg(e.rule ORDER BY e.i) FROM ${others}))`,
    })
    .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId), sql`EXISTS (SELECT 1 FROM ${others})`))
    .returning({ definition: agents.definition });

  if (!row) {
    const [agent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));
    if (!agent) throw new NotFoundError("Agent not found");
    throw new ApiError("At least one rule should exist per agent.", 400);
  }
  await invalidateDefinitions(projectId);
  return AgentDefinitionSchema.parse(row.definition);
}

/** Ingest caches definitions per project; the 5-minute TTL covers a failed removal. */
async function invalidateDefinitions(projectId: string): Promise<void> {
  try {
    await cache.remove(`${AGENT_DEFINITIONS_CACHE_KEY}:${projectId}`);
  } catch (error) {
    console.error("Failed to invalidate agent definitions cache:", error);
  }
}
