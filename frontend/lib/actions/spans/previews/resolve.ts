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

// Non-generation spans resolve to a truncated string; generation spans go to
// the pipeline. Tool-only LLM outputs split into one entry per tool so each
// tool gets its own fingerprint and preview.
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

        const match = matchProviderKey(classification.data, hint);
        if (match && match.rendered.trim() !== "") {
          resolved[raw.spanId] = match.rendered;
          break;
        }

        // No visible text — surface each tool block so descriptive fields render.
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

// Indexed by ParsedSpan.key (not spanId) so tool-only entries stay separate.
async function applyCachedKeys(
  projectId: string,
  parsedSpans: ParsedSpan[]
): Promise<{ resolved: Record<string, string | null>; uncached: ParsedSpan[] }> {
  const uniqueFingerprints = [...new Set(parsedSpans.map((s) => s.fingerprint))];

  return observe(
    {
      name: "previews:cache-lookup",
      input: {
        projectId,
        spanCount: parsedSpans.length,
        uniqueFingerprintCount: uniqueFingerprints.length,
        fingerprints: uniqueFingerprints,
      },
    },
    async () => {
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
      const staleCachedKeys: Array<{ spanId: string; fingerprint: string; key: string }> = [];

      for (const span of parsedSpans) {
        const cachedKey = fingerprintToKey.get(span.fingerprint);
        if (!cachedKey) {
          uncached.push(span);
          continue;
        }

        const rendered = observe(
          { name: "validate-mustache-key", input: { key: cachedKey, data: span.parsedData } },
          () => validateMustacheKey(cachedKey, span.parsedData)
        );
        if (rendered) {
          resolved[span.key] = rendered;
          hitFingerprints.add(span.fingerprint);
        } else {
          staleCachedKeys.push({ spanId: span.spanId, fingerprint: span.fingerprint, key: cachedKey });
          uncached.push(span);
        }
      }

      await Promise.all(
        [...hitFingerprints].map((fingerprint) =>
          cache
            .expire(SPAN_RENDERING_KEY_CACHE_KEY(projectId, fingerprint), RENDERING_KEY_TTL_SECONDS)
            .catch(() => false)
        )
      );

      return {
        resolved,
        uncached,
        cacheHitFingerprints: hitFingerprints.size,
        cacheMissFingerprints: uniqueFingerprints.length - fingerprintToKey.size,
        spansResolvedFromCache: Object.keys(resolved).length,
        spansUncached: uncached.length,
        staleCachedKeys,
        ttlRefreshed: hitFingerprints.size,
      };
    }
  );
}

async function generateKeysViaLlm(spans: ParsedSpan[]): Promise<{
  resolved: Record<string, string | null>;
  unresolved: ParsedSpan[];
  keysToSave: Array<{ fingerprint: string; key: string }>;
}> {
  return observe({ name: "previews:generate-mustache-keys", input: { spans } }, async () => {
    const resolved: Record<string, string | null> = {};
    const keysToSave: Array<{ fingerprint: string; key: string }> = [];

    if (spans.length === 0) {
      return { resolved, unresolved: [], keysToSave, llmCalled: false, generatedKeys: [] };
    }

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
    let llmError: string | null = null;
    try {
      const raw = await generatePreviewKeys(structures);
      generatedKeys = raw.slice(0, dedupedFingerprints.length);
    } catch (error) {
      llmError = error instanceof Error ? error.message : String(error);
    }

    const unresolved: ParsedSpan[] = [];
    const skippedKeys: Array<{ fingerprint: string; key: string; groupSize: number }> = [];

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
        const rendered = observe(
          { name: "previews:validate-mustache-key", input: { key, data: span.parsedData } },
          () => validateMustacheKey(key, span.parsedData)
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
      } else {
        skippedKeys.push({ fingerprint, key, groupSize: groupSpans.length });
      }
    }

    return {
      resolved,
      unresolved,
      keysToSave,
      llmCalled: true,
      llmError,
      uniqueFingerprints: dedupedFingerprints.length,
      generatedNonNullKeys: generatedKeys.filter((k) => !!k).length,
      keysSkippedNoValidRender: skippedKeys,
      spansResolved: Object.keys(resolved).length,
      spansUnresolved: unresolved.length,
    };
  });
}

// Tool-only entries use the descriptive-only heuristic; generic spans use
// the full priority-key search.
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

  await observe(
    {
      name: "previews:cache-save",
      input: { projectId, count: keysToSave.length, entries: keysToSave },
    },
    async () => {
      const failures: Array<{ fingerprint: string; error: string }> = [];

      await Promise.all(
        keysToSave.map(async ({ fingerprint, key }) => {
          try {
            await cache.set(SPAN_RENDERING_KEY_CACHE_KEY(projectId, fingerprint), key, {
              expireAfterSeconds: RENDERING_KEY_TTL_SECONDS,
            });
          } catch (error) {
            failures.push({
              fingerprint,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        })
      );

      return {
        succeeded: keysToSave.length - failures.length,
        failed: failures.length,
        failures,
      };
    }
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

// Pipeline: classify → cache lookup → LLM generation (if configured) →
// heuristic fallback → assemble per-tool results back into per-span previews.
export async function resolvePreviews(
  rawSpans: Array<{ spanId: string; data: string; name: string }>,
  spanIds: string[],
  spanTypes: Record<string, string>,
  projectId: string,
  options: ResolveOptions = {}
): Promise<SpanPreviewResult> {
  const { skipGeneration = false } = options;

  return observe(
    {
      name: "previews:resolve",
      input: { projectId, spanCount: spanIds.length, rawSpanCount: rawSpans.length, skipGeneration },
    },
    async () => {
      const { resolved: classified, needsProcessing } = classifyRawSpans(rawSpans, spanTypes);
      const inlineResolvedCount = Object.keys(classified).length;

      if (needsProcessing.length === 0) {
        return {
          previews: fillMissing(classified, spanIds),
          inlineResolved: inlineResolvedCount,
          needsProcessing: 0,
          cacheResolved: 0,
          llmResolved: 0,
          heuristicResolved: 0,
          unresolved: 0,
          path: "inline-only",
        };
      }

      const { resolved: cacheResolved, uncached } = await applyCachedKeys(projectId, needsProcessing);
      let keyResolved: Record<string, string | null> = { ...cacheResolved };
      const cacheResolvedCount = Object.keys(cacheResolved).length;
      let llmResolvedCount = 0;
      let heuristicResolvedCount = 0;
      let path: "cache-only" | "llm" | "heuristic-fallback" = "cache-only";

      if (uncached.length > 0) {
        const aiConfigured = isAiProviderConfigured();
        const llmAvailable = !skipGeneration && aiConfigured;

        if (!llmAvailable) {
          path = "heuristic-fallback";
          const heuristic = applyHeuristicFallback(uncached);
          heuristicResolvedCount = Object.values(heuristic).filter((v) => v !== null).length;
          keyResolved = { ...keyResolved, ...heuristic };
        } else {
          path = "llm";
          const { resolved: llmResolved, unresolved, keysToSave } = await generateKeysViaLlm(uncached);
          llmResolvedCount = Object.keys(llmResolved).length;
          await saveRenderingKeys(projectId, keysToSave);
          const heuristic = applyHeuristicFallback(unresolved);
          heuristicResolvedCount = Object.values(heuristic).filter((v) => v !== null).length;
          keyResolved = { ...keyResolved, ...llmResolved, ...heuristic };
        }
      }

      const assembled = assembleFinalPreviews(keyResolved, needsProcessing);
      const previews = fillMissing({ ...classified, ...assembled }, spanIds);

      return {
        previews,
        path,
        inlineResolved: inlineResolvedCount,
        needsProcessing: needsProcessing.length,
        cacheResolved: cacheResolvedCount,
        llmResolved: llmResolvedCount,
        heuristicResolved: heuristicResolvedCount,
        unresolved: Object.values(previews).filter((v) => v === null).length,
      };
    }
  ).then((result) => result.previews);
}
