import { cache, SPAN_RENDERING_KEY_CACHE_KEY } from "@/lib/cache";

import { generatePreviewKeys } from "./prompts";
import { matchProviderKey } from "./provider-keys";
import {
  classifyPayload,
  detectOutputStructure,
  generateFingerprint,
  isToolOnlyLlmOutput,
  type ProviderHint,
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

function applyProviderMatching(
  uncachedSpans: ParsedSpan[],
  spanTypes: Record<string, string>
): { resolved: SpanPreviewResult; needsLlm: ParsedSpan[] } {
  const resolved: SpanPreviewResult = {};
  const needsLlm: ParsedSpan[] = [];

  for (const span of uncachedSpans) {
    const spanType = spanTypes[span.spanId] ?? "";
    if (!GENERATION_SPAN_TYPES.has(spanType)) {
      needsLlm.push(span);
      continue;
    }

    const match = matchProviderKey(span.parsedData, span.provider);
    if (!match) {
      needsLlm.push(span);
      continue;
    }

    const rendered = match.rendered ?? validateMustacheKey(match.key, match.data ?? span.parsedData);
    if (rendered) {
      resolved[span.spanId] = rendered;
    } else {
      needsLlm.push(span);
    }
  }

  return { resolved, needsLlm };
}

async function generateAndApplyKeys(
  needsLlm: ParsedSpan[]
): Promise<{ resolved: SpanPreviewResult; keysToSave: Array<{ fingerprint: string; key: string }> }> {
  const resolved: SpanPreviewResult = {};
  const keysToSave: Array<{ fingerprint: string; key: string }> = [];

  if (needsLlm.length === 0) return { resolved, keysToSave };

  const seen = new Set<string>();
  const dedupedFingerprints: string[] = [];
  const structures: Array<{ data: unknown }> = [];
  const fingerprintToSpans = new Map<string, ParsedSpan[]>();

  for (const span of needsLlm) {
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

  for (let i = 0; i < dedupedFingerprints.length; i++) {
    const fingerprint = dedupedFingerprints[i];
    const key = generatedKeys[i] ?? null;
    const spans = fingerprintToSpans.get(fingerprint) ?? [];

    if (!key) {
      for (const span of spans) {
        resolved[span.spanId] = toJsonPreview(span.parsedData);
      }
      continue;
    }

    let keyProducedValidRender = false;

    for (const span of spans) {
      const rendered = validateMustacheKey(key, span.parsedData);
      if (rendered) {
        resolved[span.spanId] = rendered;
        keyProducedValidRender = true;
      } else {
        resolved[span.spanId] = toJsonPreview(span.parsedData);
      }
    }

    if (keyProducedValidRender) {
      keysToSave.push({ fingerprint, key });
    }
  }

  for (const span of needsLlm) {
    if (!(span.spanId in resolved)) {
      resolved[span.spanId] = toJsonPreview(span.parsedData);
    }
  }

  return { resolved, keysToSave };
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
 * classify → cached Redis keys → provider matching → LLM generation → save keys.
 */
export async function resolvePreviews(
  rawSpans: Array<{ spanId: string; data: string; name: string }>,
  spanIds: string[],
  spanTypes: Record<string, string>,
  projectId: string,
  options: ResolveOptions = {}
): Promise<SpanPreviewResult> {
  const { skipGeneration = false } = options;
  const { resolved: classifiedPreviews, needsProcessing } = classifyRawSpans(rawSpans, spanTypes);

  if (needsProcessing.length === 0) {
    return fillMissing(classifiedPreviews, spanIds);
  }

  const { resolved: cachedPreviews, uncached } = await applyCachedKeys(projectId, needsProcessing);
  const cachedResult = { ...classifiedPreviews, ...cachedPreviews };

  if (uncached.length === 0) {
    return fillMissing(cachedResult, spanIds);
  }

  const { resolved: providerPreviews, needsLlm } = applyProviderMatching(uncached, spanTypes);
  const providerResult = { ...cachedResult, ...providerPreviews };

  if (skipGeneration || needsLlm.length === 0) {
    for (const span of needsLlm) {
      providerResult[span.spanId] = toJsonPreview(span.parsedData);
    }
    return fillMissing(providerResult, spanIds);
  }

  const { resolved: llmPreviews, keysToSave } = await generateAndApplyKeys(needsLlm);

  await saveRenderingKeys(projectId, keysToSave);

  return fillMissing({ ...providerResult, ...llmPreviews }, spanIds);
}
