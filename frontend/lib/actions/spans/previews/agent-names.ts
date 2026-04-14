import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

import { fetchSkeletonHashes } from "@/lib/actions/sessions/trace-io";
import { getLanguageModel } from "@/lib/ai/model";
import { cache } from "@/lib/cache";

const CACHE_PREFIX = "agent_name:";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type AgentNamesResult = Record<string, string | null>;

async function generateAgentName(systemPrompt: string): Promise<string | null> {
  try {
    const { text } = await observe({ name: "generateAgentName" }, async () =>
      generateText({
        model: getLanguageModel("lite"),
        system:
          "Given a system prompt for an AI agent, generate a short 1-2 word name that describes the agent's role or purpose. " +
          "Return ONLY the name, nothing else. Examples: 'Code Review', 'Web Search', 'Data Analyst', 'Summarizer', 'Router'.",
        prompt: systemPrompt,
        maxRetries: 0,
        temperature: 0,
        abortSignal: AbortSignal.timeout(5000),
        experimental_telemetry: {
          isEnabled: true,
          tracer: getTracer(),
        },
      })
    );

    const name = text.trim().replace(/^["']|["']$/g, "");
    return name.length > 0 && name.length <= 50 ? name : null;
  } catch {
    return null;
  }
}

/**
 * Resolve agent names for a set of sub-agent spans given their system prompts.
 * Checks Redis cache first, generates via LLM for uncached entries.
 *
 * @param entries - Map of spanId → systemPrompt for each sub-agent boundary
 * @param projectId - Used as part of the cache key
 * @param skipGeneration - If true, only return cached names (for shared traces)
 */
export async function resolveAgentNames(
  entries: Map<string, string>,
  projectId: string,
  skipGeneration = false
): Promise<AgentNamesResult> {
  if (entries.size === 0) return {};

  const spanIds = [...entries.keys()];
  const systemPrompts = spanIds.map((id) => entries.get(id)!);

  const hashes = await fetchSkeletonHashes(systemPrompts, projectId);

  const result: AgentNamesResult = {};
  const hashToSpanIds = new Map<string, { spanIds: string[]; systemPrompt: string }>();

  for (let i = 0; i < spanIds.length; i++) {
    const hash = hashes[i];
    if (!hash) {
      result[spanIds[i]] = null;
      continue;
    }
    const existing = hashToSpanIds.get(hash);
    if (existing) {
      existing.spanIds.push(spanIds[i]);
    } else {
      hashToSpanIds.set(hash, { spanIds: [spanIds[i]], systemPrompt: systemPrompts[i] });
    }
  }

  const uniqueHashes = [...hashToSpanIds.keys()];
  const cached = await Promise.all(
    uniqueHashes.map((h) => cache.get<string>(`${CACHE_PREFIX}${projectId}:${h}`).catch(() => null))
  );

  const uncached: Array<{ hash: string; systemPrompt: string; spanIds: string[] }> = [];

  for (let i = 0; i < uniqueHashes.length; i++) {
    const entry = hashToSpanIds.get(uniqueHashes[i])!;
    const cachedName = cached[i];

    if (cachedName) {
      for (const id of entry.spanIds) result[id] = cachedName;
    } else {
      uncached.push({ hash: uniqueHashes[i], ...entry });
    }
  }

  if (skipGeneration || uncached.length === 0) {
    for (const entry of uncached) {
      for (const id of entry.spanIds) result[id] = null;
    }
    return result;
  }

  const generated = await Promise.all(uncached.map((e) => generateAgentName(e.systemPrompt)));

  const savePromises: Promise<void>[] = [];
  for (let i = 0; i < uncached.length; i++) {
    const name = generated[i];
    for (const id of uncached[i].spanIds) result[id] = name;
    if (name) {
      const key = `${CACHE_PREFIX}${projectId}:${uncached[i].hash}`;
      savePromises.push(cache.set(key, name, { expireAfterSeconds: CACHE_TTL_SECONDS }).catch(() => {}));
    }
  }

  await Promise.all(savePromises);
  return result;
}
