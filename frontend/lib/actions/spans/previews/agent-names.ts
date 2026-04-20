import { getTracer, observe } from "@lmnr-ai/lmnr";
import { generateText } from "ai";

import { tryParseJson } from "@/lib/actions/common/utils";
import { extractSystemMessageContent } from "@/lib/actions/spans/system-messages";
import { executeQuery } from "@/lib/actions/sql";
import { getLanguageModel } from "@/lib/ai/model";
import { cache } from "@/lib/cache";

const CACHE_PREFIX = "agent_name:";
const CACHE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type AgentNamesResult = Record<string, string | null>;

async function generateAgentName(systemPrompt: string): Promise<string | null> {
  try {
    const { text } = await observe({ name: "generate-agent-name" }, async () =>
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

async function fetchSystemPrompts(spanIds: string[], traceId: string, projectId: string): Promise<Map<string, string>> {
  if (spanIds.length === 0) return new Map();

  const rows = await executeQuery<{ spanId: string; systemMessage: string }>({
    projectId,
    query: `
      SELECT
        span_id as spanId,
        JSONExtractArrayRaw(input)[1] as systemMessage
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_id IN {spanIds: Array(UUID)}
        AND span_type IN ('LLM', 'CACHED')
    `,
    parameters: { traceId, spanIds },
  });

  const result = new Map<string, string>();
  for (const row of rows) {
    const parsed = tryParseJson(row.systemMessage);
    const systemText = extractSystemMessageContent(parsed);
    if (systemText) {
      result.set(row.spanId, systemText);
    }
  }
  return result;
}

export async function resolveAgentNames(
  promptHashes: Record<string, string>,
  traceId: string,
  projectId: string,
  skipGeneration = false
): Promise<AgentNamesResult> {
  const entries = Object.entries(promptHashes);
  if (entries.length === 0) return {};

  // Group span IDs by hash (multiple spans may share the same agent)
  const hashToSpanIds = new Map<string, string[]>();
  for (const [spanId, hash] of entries) {
    const existing = hashToSpanIds.get(hash);
    if (existing) {
      existing.push(spanId);
    } else {
      hashToSpanIds.set(hash, [spanId]);
    }
  }

  const uniqueHashes = [...hashToSpanIds.keys()];
  const cached = await Promise.all(
    uniqueHashes.map((h) => cache.get<string>(`${CACHE_PREFIX}${projectId}:${h}`).catch(() => null))
  );

  const result: AgentNamesResult = {};
  const uncachedHashes: string[] = [];
  const uncachedSpanIds: string[] = [];

  for (let i = 0; i < uniqueHashes.length; i++) {
    const hash = uniqueHashes[i];
    const spanIds = hashToSpanIds.get(hash)!;
    const cachedName = cached[i];

    if (cachedName) {
      for (const id of spanIds) result[id] = cachedName;
    } else {
      uncachedHashes.push(hash);
      uncachedSpanIds.push(spanIds[0]);
    }
  }

  if (skipGeneration || uncachedHashes.length === 0) {
    for (const hash of uncachedHashes) {
      for (const id of hashToSpanIds.get(hash)!) result[id] = null;
    }
    return result;
  }

  // Fetch system prompts only for uncached spans
  const systemPrompts = await fetchSystemPrompts(uncachedSpanIds, traceId, projectId);

  const toGenerate: Array<{ hash: string; systemPrompt: string }> = [];
  for (let i = 0; i < uncachedHashes.length; i++) {
    const hash = uncachedHashes[i];
    const spanId = uncachedSpanIds[i];
    const systemPrompt = systemPrompts.get(spanId);

    if (systemPrompt) {
      toGenerate.push({ hash, systemPrompt });
    } else {
      for (const id of hashToSpanIds.get(hash)!) result[id] = null;
    }
  }

  const generated = await Promise.all(toGenerate.map((e) => generateAgentName(e.systemPrompt)));

  const savePromises: Promise<void>[] = [];
  for (let i = 0; i < toGenerate.length; i++) {
    const name = generated[i];
    const hash = toGenerate[i].hash;
    for (const id of hashToSpanIds.get(hash)!) result[id] = name;
    if (name) {
      const key = `${CACHE_PREFIX}${projectId}:${hash}`;
      savePromises.push(cache.set(key, name, { expireAfterSeconds: CACHE_TTL_SECONDS }).catch(() => {}));
    }
  }

  await Promise.all(savePromises);
  return result;
}
