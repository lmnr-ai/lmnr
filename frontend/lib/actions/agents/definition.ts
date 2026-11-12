import { and, eq } from "drizzle-orm";
import { isEqual } from "lodash";
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

/** Adds the rule unless the definition already has it. */
export async function addAgentRule(input: z.infer<typeof AgentRuleSchema>): Promise<AgentDefinition> {
  const { projectId, agentId, substrings } = AgentRuleSchema.parse(input);
  const rule = substrings.map(normalize).filter(Boolean);
  if (rule.length === 0) throw new ApiError("A rule needs at least one non-empty phrase", 400);

  return updateRules(projectId, agentId, (rules) =>
    rules.some((existing) => isEqual(existing, rule)) ? rules : [...rules, rule]
  );
}

/** Removes the rule as stored; the last rule is kept, since an agent without rules matches nothing. */
export async function removeAgentRule(input: z.infer<typeof AgentRuleSchema>): Promise<AgentDefinition> {
  const { projectId, agentId, substrings } = AgentRuleSchema.parse(input);

  return updateRules(projectId, agentId, (rules) => {
    const remaining = rules.filter((existing) => !isEqual(existing, substrings));
    if (remaining.length === 0) throw new ApiError("At least one rule should exist per agent.", 400);
    return remaining;
  });
}

/** Applies `change` to the rules as stored now. The row stays locked until the write, so a
 * concurrent edit (another user, or detection adding rules) is never overwritten. */
async function updateRules(
  projectId: string,
  agentId: string,
  change: (rules: string[][]) => string[][]
): Promise<AgentDefinition> {
  const definition = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ definition: agents.definition })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)))
      .for("update");
    if (!row) throw new NotFoundError("Agent not found");

    const current = row.definition === null ? [] : AgentDefinitionSchema.parse(row.definition).any_of;
    const next: AgentDefinition = { any_of: change(current) };
    await tx
      .update(agents)
      .set({ definition: next })
      .where(and(eq(agents.id, agentId), eq(agents.projectId, projectId)));
    return next;
  });

  await invalidateDefinitions(projectId);
  return definition;
}

/** Ingest caches definitions per project; the 5-minute TTL covers a failed removal. */
async function invalidateDefinitions(projectId: string): Promise<void> {
  try {
    await cache.remove(`${AGENT_DEFINITIONS_CACHE_KEY}:${projectId}`);
  } catch (error) {
    console.error("Failed to invalidate agent definitions cache:", error);
  }
}
