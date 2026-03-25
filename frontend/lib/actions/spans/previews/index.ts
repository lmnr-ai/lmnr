import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { spanRenderingKeys } from "@/lib/db/migrations/schema";

import { generatePreviewKeys } from "./prompts.ts";
import { matchProviderKey } from "./provider-keys.ts";
import {
  classifyPayload,
  generateFingerprint,
  renderMustachePreview,
  truncateFieldValues,
  validateMustacheKey,
} from "./utils.ts";

export const GetSpanPreviewsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.string(),
  traceId: z.string(),
  spanIds: z.array(z.string()).min(1),
  spanTypes: z.record(z.string(), z.string()),
});

export type SpanPreviewResult = Record<string, string | null>;

/** Span types that support preview generation */
export const PREVIEW_SPAN_TYPES = new Set(["LLM", "CACHED", "TOOL", "EXECUTOR", "EVALUATOR"]);

/** Span types eligible for provider schema matching */
export const PROVIDER_SPAN_TYPES = new Set(["LLM", "CACHED"]);

const buildTimeConditions = (startDate?: string, endDate?: string): string[] =>
  [startDate ? "start_time >= {startDate: String}" : null, endDate ? "start_time <= {endDate: String}" : null].filter(
    (c): c is string => c !== null
  );

/**
 * Fetch output data from ClickHouse for all supported span types.
 */
const fetchSpanData = async (
  projectId: string,
  traceId: string,
  spanIds: string[],
  spanTypes: Record<string, string>,
  startDate?: string,
  endDate?: string
): Promise<Array<{ spanId: string; data: string; name: string }>> => {
  const previewSpanIds = spanIds.filter((id) => PREVIEW_SPAN_TYPES.has(spanTypes[id] ?? ""));

  if (previewSpanIds.length === 0) return [];

  const timeConditions = buildTimeConditions(startDate, endDate);

  return executeQuery<{ spanId: string; data: string; name: string }>({
    projectId,
    query: `
      SELECT
        span_id as spanId,
        output as data,
        name
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_id IN {spanIds: Array(UUID)}
        AND span_type IN ('LLM', 'CACHED', 'TOOL', 'EXECUTOR', 'EVALUATOR')
        ${timeConditions.map((c) => `AND ${c}`).join("\n        ")}
    `,
    parameters: { traceId, spanIds: previewSpanIds, startDate, endDate },
  });
};

interface ParsedSpan {
  spanId: string;
  name: string;
  parsedData: Record<string, unknown> | unknown[];
  fingerprint: string;
}

/**
 * Extract a simple preview from a parsed object without LLM generation.
 * Returns the value of the first key if it's a string or number, otherwise null.
 */
const extractFirstPrimitiveValue = (data: Record<string, unknown> | unknown[]): string | null => {
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first === "string") return first;
    if (typeof first === "number") return String(first);
    return null;
  }

  const keys = Object.keys(data);
  if (keys.length === 0) return null;

  const firstValue = data[keys[0]];
  if (typeof firstValue === "string") return firstValue;
  if (typeof firstValue === "number") return String(firstValue);
  return null;
};

interface GetSpanPreviewsOptions {
  skipGeneration?: boolean;
}

/**
 * Try provider schema matching for a span, returning the rendered preview if matched.
 */
const tryProviderMatch = (parsedData: Record<string, unknown> | unknown[], spanType: string): string | null => {
  if (!PROVIDER_SPAN_TYPES.has(spanType)) return null;

  const match = matchProviderKey(parsedData);
  if (!match) return null;

  return validateMustacheKey(match.key, match.data ?? parsedData);
};

/**
 * Classify raw spans into resolved previews and spans needing further processing.
 */
const classifyRawSpans = (
  rawSpans: Array<{ spanId: string; data: string; name: string }>,
  spanTypes: Record<string, string>,
  skipGeneration: boolean
): { resolved: SpanPreviewResult; needsProcessing: ParsedSpan[] } => {
  const resolved: SpanPreviewResult = {};
  const needsProcessing: ParsedSpan[] = [];

  rawSpans.forEach((raw) => {
    const classification = classifyPayload(raw.data);

    switch (classification.kind) {
      case "primitive":
      case "raw":
        resolved[raw.spanId] = classification.preview;
        return;
      case "empty":
        resolved[raw.spanId] = "";
        return;
      case "object": {
        if (skipGeneration) {
          const providerPreview = tryProviderMatch(classification.data, spanTypes[raw.spanId] ?? "");
          resolved[raw.spanId] = providerPreview ?? extractFirstPrimitiveValue(classification.data);
        } else {
          needsProcessing.push({
            spanId: raw.spanId,
            name: raw.name,
            parsedData: classification.data,
            fingerprint: generateFingerprint(raw.name, classification.data),
          });
        }
        return;
      }
    }
  });

  return { resolved, needsProcessing };
};

/**
 * Fill in empty strings for any spanIds that don't yet have a preview.
 */
const fillMissing = (previews: SpanPreviewResult, spanIds: string[]): SpanPreviewResult =>
  spanIds.reduce(
    (acc, id) => {
      if (!(id in acc)) acc[id] = "";
      return acc;
    },
    { ...previews }
  );

/**
 * Look up cached rendering keys from Postgres and split into resolved/uncached spans.
 */
const applyCachedKeys = async (
  projectId: string,
  parsedSpans: ParsedSpan[],
  spanTypes: Record<string, string>
): Promise<{ resolved: SpanPreviewResult; uncached: ParsedSpan[] }> => {
  const fingerprints = parsedSpans.map((s) => s.fingerprint);

  const cachedKeys = await db
    .select()
    .from(spanRenderingKeys)
    .where(and(eq(spanRenderingKeys.projectId, projectId), inArray(spanRenderingKeys.schemaFingerprint, fingerprints)));

  const fingerprintToKey = new Map(cachedKeys.map((row) => [row.schemaFingerprint, row.mustacheKey]));

  const resolved: SpanPreviewResult = {};
  const uncached: ParsedSpan[] = [];

  parsedSpans.forEach((span) => {
    const cachedKey = fingerprintToKey.get(span.fingerprint);
    if (cachedKey) {
      const isProviderType = PROVIDER_SPAN_TYPES.has(spanTypes[span.spanId] ?? "");
      const match = isProviderType ? matchProviderKey(span.parsedData) : null;
      resolved[span.spanId] = renderMustachePreview(cachedKey, match?.data ?? span.parsedData);
    } else {
      uncached.push(span);
    }
  });

  return { resolved, uncached };
};

/**
 * Try provider schema matching on uncached spans, returning resolved previews,
 * keys to save, and spans still needing LLM generation.
 */
const applyProviderMatching = (
  uncachedSpans: ParsedSpan[],
  spanTypes: Record<string, string>
): {
  resolved: SpanPreviewResult;
  keysToSave: Array<{ fingerprint: string; key: string }>;
  needsLlm: ParsedSpan[];
} => {
  const resolved: SpanPreviewResult = {};
  const keysToSave: Array<{ fingerprint: string; key: string }> = [];
  const needsLlm: ParsedSpan[] = [];

  uncachedSpans.forEach((span) => {
    const rendered = tryProviderMatch(span.parsedData, spanTypes[span.spanId] ?? "");
    if (rendered) {
      resolved[span.spanId] = rendered;
      const match = matchProviderKey(span.parsedData);
      if (match) keysToSave.push({ fingerprint: span.fingerprint, key: match.key });
    } else {
      needsLlm.push(span);
    }
  });

  return { resolved, keysToSave, needsLlm };
};

/**
 * Deduplicate spans by fingerprint, keeping one example per unique schema shape.
 */
const deduplicateByFingerprint = (
  spans: ParsedSpan[]
): { dedupedFingerprints: string[]; structures: Array<{ data: unknown }> } => {
  const seen = new Set<string>();
  const dedupedFingerprints: string[] = [];
  const structures: Array<{ data: unknown }> = [];

  spans.forEach((span) => {
    if (!seen.has(span.fingerprint)) {
      seen.add(span.fingerprint);
      dedupedFingerprints.push(span.fingerprint);
      structures.push({ data: truncateFieldValues(span.parsedData, 50) });
    }
  });

  return { dedupedFingerprints, structures };
};

/**
 * Group spans by fingerprint for batch application of generated keys.
 */
const groupByFingerprint = (spans: ParsedSpan[]): Map<string, ParsedSpan[]> =>
  spans.reduce((map, span) => {
    const group = map.get(span.fingerprint);
    if (group) {
      group.push(span);
    } else {
      map.set(span.fingerprint, [span]);
    }
    return map;
  }, new Map<string, ParsedSpan[]>());

/**
 * Generate preview keys via LLM and apply them to spans.
 */
const generateAndApplyKeys = async (
  needsLlm: ParsedSpan[]
): Promise<{
  resolved: SpanPreviewResult;
  keysToSave: Array<{ fingerprint: string; key: string }>;
}> => {
  const resolved: SpanPreviewResult = {};
  const keysToSave: Array<{ fingerprint: string; key: string }> = [];

  if (needsLlm.length === 0) return { resolved, keysToSave };

  try {
    const { dedupedFingerprints, structures } = deduplicateByFingerprint(needsLlm);
    const results = await generatePreviewKeys(structures);
    const fingerprintToSpans = groupByFingerprint(needsLlm);

    results.slice(0, dedupedFingerprints.length).forEach((key, i) => {
      const fingerprint = dedupedFingerprints[i];
      const spans = fingerprintToSpans.get(fingerprint);
      if (!spans) return;

      spans.forEach((span) => {
        if (key) {
          const rendered = validateMustacheKey(key, span.parsedData);
          resolved[span.spanId] = rendered ?? JSON.stringify(span.parsedData).slice(0, 500);
        } else {
          resolved[span.spanId] = JSON.stringify(span.parsedData).slice(0, 500);
        }
      });

      if (key) keysToSave.push({ fingerprint, key });
    });
  } catch (error) {
    console.error("Preview key generation failed:", error);
    needsLlm.forEach((span) => {
      if (!(span.spanId in resolved)) {
        resolved[span.spanId] = JSON.stringify(span.parsedData).slice(0, 500);
      }
    });
  }

  return { resolved, keysToSave };
};

/**
 * Persist rendering keys to Postgres for future cache hits.
 */
const saveRenderingKeys = async (
  projectId: string,
  keysToSave: Array<{ fingerprint: string; key: string }>
): Promise<void> => {
  if (keysToSave.length === 0) return;

  try {
    await db
      .insert(spanRenderingKeys)
      .values(
        keysToSave.map(({ fingerprint, key }) => ({
          projectId,
          schemaFingerprint: fingerprint,
          mustacheKey: key,
        }))
      )
      .onConflictDoNothing();
  } catch (error) {
    console.error("Failed to save rendering keys:", error);
  }
};

/**
 * Main server action: orchestrates the preview generation flow.
 * When skipGeneration is true, skips DB fingerprint lookups and LLM key generation.
 */
export async function getSpanPreviews(
  input: z.infer<typeof GetSpanPreviewsSchema>,
  options: GetSpanPreviewsOptions = {}
): Promise<SpanPreviewResult> {
  const { skipGeneration = false } = options;
  const { projectId, traceId, spanIds, spanTypes, startDate, endDate } = GetSpanPreviewsSchema.parse(input);

  const rawSpans = await fetchSpanData(projectId, traceId, spanIds, spanTypes, startDate, endDate);

  const { resolved: classifiedPreviews, needsProcessing } = classifyRawSpans(rawSpans, spanTypes, skipGeneration);

  if (needsProcessing.length === 0 || skipGeneration) {
    return fillMissing(classifiedPreviews, spanIds);
  }

  const { resolved: cachedPreviews, uncached } = await applyCachedKeys(projectId, needsProcessing, spanTypes);

  const cachedResult = { ...classifiedPreviews, ...cachedPreviews };

  if (uncached.length === 0) {
    return fillMissing(cachedResult, spanIds);
  }

  const { resolved: providerPreviews, keysToSave: providerKeys, needsLlm } = applyProviderMatching(uncached, spanTypes);

  const { resolved: llmPreviews, keysToSave: llmKeys } = await generateAndApplyKeys(needsLlm);

  await saveRenderingKeys(projectId, [...providerKeys, ...llmKeys]);

  return fillMissing({ ...cachedResult, ...providerPreviews, ...llmPreviews }, spanIds);
}
