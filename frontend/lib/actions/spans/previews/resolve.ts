import { observe } from "@lmnr-ai/lmnr";

import { isAiProviderConfigured } from "@/lib/ai/model";
import { cache, SPAN_RENDERING_KEY_CACHE_KEY } from "@/lib/cache";

import { tryDescriptiveHeuristicPreview, tryHeuristicPreview } from "./heuristic";
import { generatePreviewKeys, type PreviewVariant } from "./prompts";
import { matchProviderKey } from "./provider-keys";
import { extractToolsIfToolOnly } from "./tool-detection";
import { classifyPayload, detectOutputStructure, generateFingerprint, validateMustacheKey } from "./utils";

const RENDERING_KEY_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type SpanPreviewResult = Record<string, string | null>;

const GENERATION_SPAN_TYPES = new Set(["LLM", "CACHED", "TOOL"]);

interface ParsedSpan {
  key: string;
  spanId: string;
  name: string;
  parsedData: Record<string, unknown> | unknown[];
  fingerprint: string;
  variant: PreviewVariant;
  toolIndex?: number;
  toolName?: string;
}

/**
 * Classify raw span payloads. Non-generation spans are resolved directly to a
 * truncated string; generation spans with object payloads are returned for
 * further processing by the resolution pipeline.
 *
 * Tool-only LLM outputs are split into one `ParsedSpan` entry per tool so
 * each tool's arguments get their own fingerprint (enabling cache reuse
 * across different tool mixes) and their own preview rendering.
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
        const hint = detectOutputStructure(classification.data);

        // Happy path: provider schema extracts non-empty text/thinking → done.
        const match = matchProviderKey(classification.data, hint);
        if (match && match.rendered.trim() !== "") {
          resolved[raw.spanId] = match.rendered;
          break;
        }

        // No visible text. For LLM outputs, surface every tool block so each
        // tool's descriptive fields (e.g. input.description) flow through the
        // pipeline independently instead of rendering nothing.
        const tools =
          spanType === "LLM" || spanType === "CACHED" ? extractToolsIfToolOnly(classification.data, hint) : null;

        if (tools && tools.length > 0) {
          tools.forEach((tool, toolIndex) => {
            const toolData = (tool.input ?? {}) as Record<string, unknown> | unknown[];
            needsProcessing.push({
              key: `${raw.spanId}#${toolIndex}`,
              spanId: raw.spanId,
              name: raw.name,
              parsedData: toolData,
              fingerprint: generateFingerprint(`${raw.name}:llm_tool:${tool.name}`, toolData),
              variant: "llm_tool_only",
              toolIndex,
              toolName: tool.name,
            });
          });
          break;
        }

        needsProcessing.push({
          key: raw.spanId,
          spanId: raw.spanId,
          name: raw.name,
          parsedData: classification.data as Record<string, unknown> | unknown[],
          fingerprint: generateFingerprint(raw.name, classification.data),
          variant: "generic",
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
    if (!(id in result)) result[id] = null;
  }
  return result;
}

/**
 * Look up cached LLM-generated Mustache keys by structural fingerprint.
 * Indexed by each ParsedSpan's `key` (not `spanId`) so tool-only entries
 * stay separate.
 */
async function applyCachedKeys(
  projectId: string,
  parsedSpans: ParsedSpan[]
): Promise<{ resolved: Record<string, string | null>; uncached: ParsedSpan[] }> {
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

  const resolved: Record<string, string | null> = {};
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
      resolved[span.key] = rendered;
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
  resolved: Record<string, string | null>;
  unresolved: ParsedSpan[];
  keysToSave: Array<{ fingerprint: string; key: string }>;
}> {
  return observe({ name: "transcript:generate-mustache-keys", input: { spans } }, async () => {
    const resolved: Record<string, string | null> = {};
    const keysToSave: Array<{ fingerprint: string; key: string }> = [];

    if (spans.length === 0) return { resolved, unresolved: [], keysToSave };

    const seen = new Set<string>();
    const dedupedFingerprints: string[] = [];
    const structures: Array<{ data: unknown; variant: PreviewVariant }> = [];
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
        structures.push({ data: span.parsedData, variant: span.variant });
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
          resolved[span.key] = rendered;
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
 * valid key for a span. Dispatches based on variant: tool-only LLM entries
 * use the strictly descriptive-only heuristic (description/summary/title or
 * null), while generic spans use the full priority-key search.
 */
function applyHeuristicFallback(spans: ParsedSpan[]): Record<string, string | null> {
  const resolved: Record<string, string | null> = {};
  for (const span of spans) {
    resolved[span.key] =
      span.variant === "llm_tool_only"
        ? tryDescriptiveHeuristicPreview(span.parsedData)
        : tryHeuristicPreview(span.parsedData);
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

function assembleToolOnlyPreview(toolNames: string[], perToolRendered: Array<string | null>): string | null {
  const lines: string[] = [];
  for (let i = 0; i < toolNames.length; i++) {
    const v = perToolRendered[i]?.trim();
    if (v) lines.push(`${toolNames[i]}: ${v}`);
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function assembleFinalPreviews(
  keyResolved: Record<string, string | null>,
  parsedSpans: ParsedSpan[]
): SpanPreviewResult {
  const result: SpanPreviewResult = {};

  // Group tool-only entries by their real spanId.
  const toolOnlyBySpanId = new Map<string, ParsedSpan[]>();
  for (const span of parsedSpans) {
    if (span.variant === "llm_tool_only") {
      const group = toolOnlyBySpanId.get(span.spanId);
      if (group) group.push(span);
      else toolOnlyBySpanId.set(span.spanId, [span]);
    } else {
      result[span.spanId] = keyResolved[span.key] ?? null;
    }
  }

  for (const [spanId, group] of toolOnlyBySpanId) {
    const ordered = [...group].sort((a, b) => (a.toolIndex ?? 0) - (b.toolIndex ?? 0));
    const names = ordered.map((s) => s.toolName ?? "");
    const rendered = ordered.map((s) => keyResolved[s.key] ?? null);
    result[spanId] = assembleToolOnlyPreview(names, rendered);
  }

  return result;
}

export interface ResolveOptions {
  skipGeneration?: boolean;
}

/**
 * Run the full preview resolution pipeline on pre-fetched span data:
 *   1. classify raw payloads; resolve inline when a provider schema (OpenAI /
 *      Anthropic / Gemini / LangChain) yields non-empty text/thinking, and
 *      split tool-only LLM outputs into per-tool entries
 *   2. look up cached LLM-generated Mustache keys by fingerprint
 *   3. generate new keys via LLM (when a provider is configured) and persist them
 *   4. fall back to priority-key heuristic for anything still unresolved
 *      (this is the only path for tool spans when no LLM provider is configured)
 *   5. group per-tool results back into one preview string per span
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
  let keyResolved: Record<string, string | null> = { ...cacheResolved };

  if (uncached.length > 0) {
    const llmAvailable = !skipGeneration && isAiProviderConfigured();

    if (!llmAvailable) {
      keyResolved = { ...keyResolved, ...applyHeuristicFallback(uncached) };
    } else {
      const { resolved: llmResolved, unresolved, keysToSave } = await generateKeysViaLlm(uncached);
      await saveRenderingKeys(projectId, keysToSave);
      keyResolved = { ...keyResolved, ...llmResolved, ...applyHeuristicFallback(unresolved) };
    }
  }

  const assembled = assembleFinalPreviews(keyResolved, needsProcessing);
  return fillMissing({ ...classified, ...assembled }, spanIds);
}
