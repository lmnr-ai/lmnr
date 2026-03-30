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
  detectOutputStructure,
  generateFingerprint,
  type ProviderHint,
  validateMustacheKey,
} from "./utils.ts";

export const GetSpanPreviewsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.guid(),
  traceId: z.guid(),
  spanIds: z.array(z.string()).min(1),
  spanTypes: z.record(z.string(), z.string()),
});

export type SpanPreviewResult = Record<string, string | null>;

export const PREVIEW_SPAN_TYPES = new Set(["LLM", "CACHED", "TOOL", "EXECUTOR", "EVALUATOR"]);

/** Span types that go through the full preview generation pipeline (provider matching + LLM key generation). */
const GENERATION_SPAN_TYPES = new Set(["LLM", "CACHED"]);

const buildTimeConditions = (startDate?: string, endDate?: string): string[] =>
  [startDate ? "start_time >= {startDate: String}" : null, endDate ? "start_time <= {endDate: String}" : null].filter(
    (c): c is string => c !== null
  );

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
  provider: ProviderHint;
}

interface GetSpanPreviewsOptions {
  skipGeneration?: boolean;
}

const tryProviderMatch = (
  parsedData: Record<string, unknown> | unknown[],
  spanType: string,
  providerHint?: ProviderHint
): { rendered: string; key: string } | null => {
  if (!GENERATION_SPAN_TYPES.has(spanType)) return null;

  const match = matchProviderKey(parsedData, providerHint);
  if (!match) return null;

  const rendered = validateMustacheKey(match.key, match.data ?? parsedData);
  if (!rendered) return null;

  return { rendered, key: match.key };
};

const toJsonPreview = (data: unknown): string => JSON.stringify(data).slice(0, 2000);

/**
 * Classify raw spans into resolved previews and spans needing further processing.
 *
 * Only LLM/CACHED spans are candidates for the generation pipeline.
 * All other span types resolve immediately with their raw output.
 */
const classifyRawSpans = (
  rawSpans: Array<{ spanId: string; data: string; name: string }>,
  spanTypes: Record<string, string>
): { resolved: SpanPreviewResult; needsProcessing: ParsedSpan[] } => {
  const resolved: SpanPreviewResult = {};
  const needsProcessing: ParsedSpan[] = [];

  rawSpans.forEach((raw) => {
    const spanType = spanTypes[raw.spanId] ?? "";

    if (!GENERATION_SPAN_TYPES.has(spanType)) {
      const rawStr = typeof raw.data === "string" ? raw.data : JSON.stringify(raw.data);
      resolved[raw.spanId] = rawStr.length > 1000 ? rawStr.slice(0, 1000) : rawStr;
      return;
    }

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
        needsProcessing.push({
          spanId: raw.spanId,
          name: raw.name,
          parsedData: classification.data,
          fingerprint: generateFingerprint(raw.name, classification.data),
          provider: detectOutputStructure(classification.data),
        });
        return;
      }
    }
  });

  return { resolved, needsProcessing };
};

const fillMissing = (previews: SpanPreviewResult, spanIds: string[]): SpanPreviewResult =>
  spanIds.reduce(
    (acc, id) => {
      if (!(id in acc)) acc[id] = "";
      return acc;
    },
    { ...previews }
  );

const applyCachedKeys = async (
  projectId: string,
  parsedSpans: ParsedSpan[],
  spanTypes: Record<string, string>
): Promise<{ resolved: SpanPreviewResult; uncached: ParsedSpan[] }> => {
  const fingerprints = parsedSpans.map((s) => s.fingerprint);

  let cachedKeys: Array<{ schemaFingerprint: string; mustacheKey: string }>;
  try {
    cachedKeys = await db
      .select()
      .from(spanRenderingKeys)
      .where(
        and(eq(spanRenderingKeys.projectId, projectId), inArray(spanRenderingKeys.schemaFingerprint, fingerprints))
      );
  } catch (error) {
    // Table may not exist yet (pending migration) — treat all spans as uncached
    console.error("Failed to look up cached rendering keys:", error);
    return { resolved: {}, uncached: parsedSpans };
  }

  const fingerprintToKey = new Map(cachedKeys.map((row) => [row.schemaFingerprint, row.mustacheKey]));

  const resolved: SpanPreviewResult = {};
  const uncached: ParsedSpan[] = [];

  parsedSpans.forEach((span) => {
    const cachedKey = fingerprintToKey.get(span.fingerprint);
    if (cachedKey) {
      const isProviderType = GENERATION_SPAN_TYPES.has(spanTypes[span.spanId] ?? "");
      const match = isProviderType ? matchProviderKey(span.parsedData, span.provider) : null;
      const rendered = validateMustacheKey(cachedKey, match?.data ?? span.parsedData);
      if (rendered) {
        resolved[span.spanId] = rendered;
      } else if (match) {
        const providerRendered = validateMustacheKey(match.key, match.data ?? span.parsedData);
        resolved[span.spanId] = providerRendered ?? toJsonPreview(span.parsedData);
      } else {
        resolved[span.spanId] = toJsonPreview(span.parsedData);
      }
    } else {
      uncached.push(span);
    }
  });

  return { resolved, uncached };
};

const applyProviderMatching = (
  uncachedSpans: ParsedSpan[],
  spanTypes: Record<string, string>
): {
  resolved: SpanPreviewResult;
  needsLlm: ParsedSpan[];
} => {
  const resolved: SpanPreviewResult = {};
  const needsLlm: ParsedSpan[] = [];

  uncachedSpans.forEach((span) => {
    const providerMatch = tryProviderMatch(span.parsedData, spanTypes[span.spanId] ?? "", span.provider);
    if (providerMatch) {
      resolved[span.spanId] = providerMatch.rendered;
    } else {
      needsLlm.push(span);
    }
  });

  return { resolved, needsLlm };
};

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
      structures.push({ data: span.parsedData });
    }
  });

  return { dedupedFingerprints, structures };
};

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

const generateAndApplyKeys = async (
  needsLlm: ParsedSpan[]
): Promise<{
  resolved: SpanPreviewResult;
  keysToSave: Array<{ fingerprint: string; key: string }>;
}> => {
  const resolved: SpanPreviewResult = {};
  const keysToSave: Array<{ fingerprint: string; key: string }> = [];

  if (needsLlm.length === 0) return { resolved, keysToSave };

  const { dedupedFingerprints, structures } = deduplicateByFingerprint(needsLlm);
  const fingerprintToSpans = groupByFingerprint(needsLlm);

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

  // Fill in JSON fallback for any spans without a preview (e.g. LLM returned fewer results)
  for (const span of needsLlm) {
    if (!(span.spanId in resolved)) {
      resolved[span.spanId] = toJsonPreview(span.parsedData);
    }
  }

  return { resolved, keysToSave };
};

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

export async function getSpanPreviews(
  input: z.infer<typeof GetSpanPreviewsSchema>,
  options: GetSpanPreviewsOptions = {}
): Promise<SpanPreviewResult> {
  const { skipGeneration = false } = options;
  const { projectId, traceId, spanIds, spanTypes, startDate, endDate } = GetSpanPreviewsSchema.parse(input);

  const rawSpans = await fetchSpanData(projectId, traceId, spanIds, spanTypes, startDate, endDate);

  const { resolved: classifiedPreviews, needsProcessing } = classifyRawSpans(rawSpans, spanTypes);

  if (needsProcessing.length === 0) {
    return fillMissing(classifiedPreviews, spanIds);
  }

  const { resolved: cachedPreviews, uncached } = await applyCachedKeys(projectId, needsProcessing, spanTypes);

  const cachedResult = { ...classifiedPreviews, ...cachedPreviews };

  if (uncached.length === 0) {
    return fillMissing(cachedResult, spanIds);
  }

  const { resolved: providerPreviews, needsLlm } = applyProviderMatching(uncached, spanTypes);

  const providerResult = { ...cachedResult, ...providerPreviews };

  if (skipGeneration || needsLlm.length === 0) {
    // Shared traces: resolve remaining spans with JSON fallback, no LLM calls
    for (const span of needsLlm) {
      providerResult[span.spanId] = toJsonPreview(span.parsedData);
    }
    return fillMissing(providerResult, spanIds);
  }

  const { resolved: llmPreviews, keysToSave: llmKeys } = await generateAndApplyKeys(needsLlm);

  await saveRenderingKeys(projectId, llmKeys);

  return fillMissing({ ...providerResult, ...llmPreviews }, spanIds);
}
