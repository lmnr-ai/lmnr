import { observe } from "@lmnr-ai/lmnr";

import { isAiProviderConfigured } from "@/lib/ai/model";
import { cache, SPAN_RENDERING_KEY_CACHE_KEY } from "@/lib/cache";

import { generatePreviewKeys } from "./prompts";
import { matchProviderKey } from "./provider-keys";
import {
  classifyPayload,
  detectOutputStructure,
  generateFingerprint,
  isToolOnlyLlmOutput,
  type ProviderHint,
  tryHeuristicPreview,
  validateMustacheKey,
} from "./utils";

const RENDERING_KEY_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SpanPreviewResult = Record<string, string | null>;

const GENERATION_SPAN_TYPES = new Set(["LLM", "CACHED", "TOOL"]);

interface ParsedSpan {
  spanId: string;
  name: string;
  parsedData: Record<string, unknown> | unknown[];
  fingerprint: string;
  provider: ProviderHint;
}

const toJsonPreview = (data: unknown): string => JSON.stringify(data).slice(0, 2000);

/**
 * Classify raw span payloads. Non-generation spans are resolved directly to a
 * truncated string; generation spans with object payloads are returned for
 * further processing by the resolution pipeline.
 */
function classifyRawSpans(
  rawSpans: Array<{ spanId: string; data: string; name: string }>,
  spanTypes: Record<string, string>
): { resolved: SpanPreviewResult; needsProcessing: ParsedSpan[] } {
  const resolved: SpanPreviewResult = {};
  const needsProcessing: ParsedSpan[] = [];

  for (const raw of rawSpans) {
    const spanType = spanTypes[raw.spanId] ?? "";

    if (!GENERATION_SPAN_TYPES.has(spanType)) {
      const rawStr = typeof raw.data === "string" ? raw.data : JSON.stringify(raw.data);
      resolved[raw.spanId] = rawStr.length > 1000 ? rawStr.slice(0, 1000) : rawStr;
      continue;
    }

    const classification = classifyPayload(raw.data);

    switch (classification.kind) {
      case "primitive":
      case "raw":
        resolved[raw.spanId] = classification.preview;
        break;
      case "empty":
        resolved[raw.spanId] = "";
        break;
      case "object": {
        if ((spanType === "LLM" || spanType === "CACHED") && isToolOnlyLlmOutput(classification.data)) {
          resolved[raw.spanId] = null;
          break;
        }
        needsProcessing.push({
          spanId: raw.spanId,
          name: raw.name,
          parsedData: classification.data,
          fingerprint: generateFingerprint(raw.name, classification.data),
          provider: detectOutputStructure(classification.data),
        });
        break;
      }
    }
  }

  return { resolved, needsProcessing };
}

function fillMissing(previews: SpanPreviewResult, spanIds: string[]): SpanPreviewResult {
  const result = { ...previews };
  for (const id of spanIds) {
    if (!(id in result)) result[id] = "";
  }
  return result;
}

/**
 * Match known provider structures (OpenAI, Anthropic, Gemini, LangChain).
 */
function applyProviderMatching(spans: ParsedSpan[]): { resolved: SpanPreviewResult; unmatched: ParsedSpan[] } {
  const resolved: SpanPreviewResult = {};
  const unmatched: ParsedSpan[] = [];

  for (const span of spans) {
    const match = matchProviderKey(span.parsedData, span.provider);
    if (match) {
      resolved[span.spanId] = match.rendered;
    } else {
      unmatched.push(span);
    }
  }

  return { resolved, unmatched };
}

/**
 * Look up cached LLM-generated Mustache keys by structural fingerprint.
 */
async function applyCachedKeys(
  projectId: string,
  parsedSpans: ParsedSpan[]
): Promise<{ resolved: SpanPreviewResult; uncached: ParsedSpan[] }> {
  const uniqueFingerprints = [...new Set(parsedSpans.map((s) => s.fingerprint))];

  const cachedEntries = await Promise.all(
    uniqueFingerprints.map(async (fingerprint) => {
      try {
        const key = await cache.get<string>(SPAN_RENDERING_KEY_CACHE_KEY(projectId, fingerprint));
        return [fingerprint, key] as const;
      } catch {
        return [fingerprint, null] as const;
      }
    })
  );

  const fingerprintToKey = new Map<string, string>();
  for (const [fingerprint, key] of cachedEntries) {
    if (key) fingerprintToKey.set(fingerprint, key);
  }

  const resolved: SpanPreviewResult = {};
  const uncached: ParsedSpan[] = [];
  const hitFingerprints = new Set<string>();

  for (const span of parsedSpans) {
    const cachedKey = fingerprintToKey.get(span.fingerprint);
    if (!cachedKey) {
      uncached.push(span);
      continue;
    }

    const rendered = validateMustacheKey(cachedKey, span.parsedData);
    if (rendered) {
      resolved[span.spanId] = rendered;
      hitFingerprints.add(span.fingerprint);
    } else {
      uncached.push(span);
    }
  }

  // Refresh TTL on successful hits so active schemas don't expire.
  await Promise.all(
    [...hitFingerprints].map((fingerprint) =>
      cache.expire(SPAN_RENDERING_KEY_CACHE_KEY(projectId, fingerprint), RENDERING_KEY_TTL_SECONDS).catch(() => false)
    )
  );

  return { resolved, uncached };
}

/**
 * Ask the LLM to generate Mustache keys for remaining structures.
 * Keys that render successfully are persisted back to the cache.
 */
async function generateKeysViaLlm(spans: ParsedSpan[]): Promise<{
  resolved: SpanPreviewResult;
  unresolved: ParsedSpan[];
  keysToSave: Array<{ fingerprint: string; key: string }>;
}> {
  return observe({ name: "transcript:generate-mustache-keys", input: { spans } }, async () => {
    const resolved: SpanPreviewResult = {};
    const keysToSave: Array<{ fingerprint: string; key: string }> = [];

    if (spans.length === 0) return { resolved, unresolved: [], keysToSave };

    const seen = new Set<string>();
    const dedupedFingerprints: string[] = [];
    const structures: Array<{ data: unknown }> = [];
    const fingerprintToSpans = new Map<string, ParsedSpan[]>();

    for (const span of spans) {
      const group = fingerprintToSpans.get(span.fingerprint);
      if (group) {
        group.push(span);
      } else {
        fingerprintToSpans.set(span.fingerprint, [span]);
      }
      if (!seen.has(span.fingerprint)) {
        seen.add(span.fingerprint);
        dedupedFingerprints.push(span.fingerprint);
        structures.push({ data: span.parsedData });
      }
    }

    let generatedKeys: Array<string | null> = [];
    try {
      const raw = await generatePreviewKeys(structures);
      generatedKeys = raw.slice(0, dedupedFingerprints.length);
    } catch (error) {
      console.error("Preview key generation failed:", error);
    }

    const unresolved: ParsedSpan[] = [];

    for (let i = 0; i < dedupedFingerprints.length; i++) {
      const fingerprint = dedupedFingerprints[i];
      const key = generatedKeys[i] ?? null;
      const groupSpans = fingerprintToSpans.get(fingerprint) ?? [];

      if (!key) {
        unresolved.push(...groupSpans);
        continue;
      }

      let keyProducedValidRender = false;

      for (const span of groupSpans) {
        const rendered = observe({ name: "validate-mustache-key", input: { key, data: span.parsedData } }, () =>
          validateMustacheKey(key, span.parsedData)
        );
        if (rendered) {
          resolved[span.spanId] = rendered;
          keyProducedValidRender = true;
        } else {
          unresolved.push(span);
        }
      }

      if (keyProducedValidRender) {
        keysToSave.push({ fingerprint, key });
      }
    }

    return { resolved, unresolved, keysToSave };
  });
}

/**
 * Last-resort fallback used when the LLM path is unavailable or produced no
 * valid key for a span. Picks the first primitive leaf (object key order,
 * array index 0) and falls back to a truncated JSON preview.
 */
function applyHeuristicFallback(spans: ParsedSpan[]): SpanPreviewResult {
  const resolved: SpanPreviewResult = {};
  for (const span of spans) {
    resolved[span.spanId] = tryHeuristicPreview(span.parsedData) ?? toJsonPreview(span.parsedData);
  }
  return resolved;
}

async function saveRenderingKeys(
  projectId: string,
  keysToSave: Array<{ fingerprint: string; key: string }>
): Promise<void> {
  if (keysToSave.length === 0) return;

  await Promise.all(
    keysToSave.map(({ fingerprint, key }) =>
      cache
        .set(SPAN_RENDERING_KEY_CACHE_KEY(projectId, fingerprint), key, {
          expireAfterSeconds: RENDERING_KEY_TTL_SECONDS,
        })
        .catch((error) => {
          console.error("Failed to save rendering key:", error);
        })
    )
  );
}

export interface ResolveOptions {
  skipGeneration?: boolean;
}

/**
 * Run the full preview resolution pipeline on pre-fetched span data:
 *   1. classify raw payloads
 *   2. look up cached LLM-generated Mustache keys by fingerprint
 *   3. match known provider structures (OpenAI / Anthropic / Gemini / LangChain)
 *   4. generate new keys via LLM (when a provider is configured) and persist them
 *   5. fall back to first-primitive-leaf heuristic for anything still unresolved
 *      (this is the only path for tool spans when no LLM provider is configured)
 */
export async function resolvePreviews(
  rawSpans: Array<{ spanId: string; data: string; name: string }>,
  spanIds: string[],
  spanTypes: Record<string, string>,
  projectId: string,
  options: ResolveOptions = {}
): Promise<SpanPreviewResult> {
  const { skipGeneration = false } = options;
  const { resolved: classified, needsProcessing } = classifyRawSpans(rawSpans, spanTypes);

  if (needsProcessing.length === 0) {
    return fillMissing(classified, spanIds);
  }

  const { resolved: cacheResolved, uncached } = await applyCachedKeys(projectId, needsProcessing);
  let accumulated: SpanPreviewResult = { ...classified, ...cacheResolved };
  if (uncached.length === 0) {
    return fillMissing(accumulated, spanIds);
  }

  const { resolved: providerResolved, unmatched } = applyProviderMatching(uncached);
  accumulated = { ...accumulated, ...providerResolved };
  if (unmatched.length === 0) {
    return fillMissing(accumulated, spanIds);
  }

  const llmAvailable = !skipGeneration && isAiProviderConfigured();

  if (!llmAvailable) {
    return fillMissing({ ...accumulated, ...applyHeuristicFallback(unmatched) }, spanIds);
  }

  const { resolved: llmResolved, unresolved, keysToSave } = await generateKeysViaLlm(unmatched);
  await saveRenderingKeys(projectId, keysToSave);

  return fillMissing({ ...accumulated, ...llmResolved, ...applyHeuristicFallback(unresolved) }, spanIds);
}
