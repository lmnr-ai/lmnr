import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { extractInputsForGroup, joinUserParts } from "@/lib/actions/sessions/extract-input";
import { type ParsedInput, parseExtractedMessages } from "@/lib/actions/sessions/parse-input";
import { fetchSkeletonHashes } from "@/lib/actions/sessions/trace-io";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { spanRenderingKeys } from "@/lib/db/migrations/schema";

import { generatePreviewKeys } from "./prompts.ts";
import { matchProviderKey } from "./provider-keys.ts";
import {
  classifyPayload,
  detectOutputStructure,
  generateFingerprint,
  isToolOnlyLlmOutput,
  type ProviderHint,
  validateMustacheKey,
} from "./utils.ts";

export const GetSpanPreviewsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.guid(),
  traceId: z.guid(),
  spanIds: z.array(z.string()).min(1),
  spanTypes: z.record(z.string(), z.string()),
  inputSpanIds: z.array(z.string()).optional(),
});

export type SpanPreviewResult = Record<string, string | null>;

export const PREVIEW_SPAN_TYPES = new Set(["LLM", "CACHED", "TOOL", "EXECUTOR", "EVALUATOR"]);

/** Span types that go through the full preview generation pipeline (provider matching + LLM key generation). */
const GENERATION_SPAN_TYPES = new Set(["LLM", "CACHED", "TOOL"]);

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
  endDate?: string,
  inputSpanIds?: string[]
): Promise<Array<{ spanId: string; data: string; name: string }>> => {
  const inputSpanIdSet = new Set(inputSpanIds ?? []);
  const previewSpanIds = spanIds.filter((id) => PREVIEW_SPAN_TYPES.has(spanTypes[id] ?? ""));

  if (previewSpanIds.length === 0) return [];

  const timeConditions = buildTimeConditions(startDate, endDate);

  // For inputSpanIds, always fetch `input` regardless of span type.
  // For others, keep existing behavior: TOOL -> input, everything else -> output.
  const dataExpr =
    inputSpanIdSet.size > 0
      ? `if(span_id IN {inputSpanIds: Array(UUID)}, input, if(span_type = 'TOOL', input, output))`
      : `if(span_type = 'TOOL', input, output)`;

  const parameters: Record<string, unknown> = { traceId, spanIds: previewSpanIds, startDate, endDate };
  if (inputSpanIdSet.size > 0) {
    parameters.inputSpanIds = Array.from(inputSpanIdSet);
  }

  return executeQuery<{ spanId: string; data: string; name: string }>({
    projectId,
    query: `
      SELECT
        span_id as spanId,
        ${dataExpr} as data,
        name
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_id IN {spanIds: Array(UUID)}
        AND span_type IN ('LLM', 'CACHED', 'TOOL', 'EXECUTOR', 'EVALUATOR')
        ${timeConditions.map((c) => `AND ${c}`).join("\n        ")}
    `,
    parameters,
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

  if (match.rendered) return { rendered: match.rendered, key: match.key };

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
        if ((spanType === "LLM" || spanType === "CACHED") && isToolOnlyLlmOutput(classification.data)) {
          resolved[raw.spanId] = null;
          return;
        }
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
  parsedSpans: ParsedSpan[]
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
    if (!cachedKey) {
      uncached.push(span);
      return;
    }

    const rendered = validateMustacheKey(cachedKey, span.parsedData);
    if (rendered) {
      resolved[span.spanId] = rendered;
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

export interface RawSpanData {
  spanId: string;
  data: string;
  name: string;
}

/**
 * Parse raw LLM span input data into system text + user parts,
 * matching the same parsing logic as trace-io's fetchTraceInputOnly.
 */
function parseSpanInput(rawData: string): ParsedInput | null {
  if (!rawData) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return null;
  }

  let messagesArr: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    messagesArr = parsed;
  } else if (parsed && typeof parsed === "object" && "messages" in parsed) {
    const msgs = (parsed as Record<string, unknown>).messages;
    if (Array.isArray(msgs)) messagesArr = msgs;
  }

  if (!messagesArr || messagesArr.length === 0) return null;

  const firstMsg = JSON.stringify(messagesArr[0]);
  const lastMsg = messagesArr.length > 1 ? JSON.stringify(messagesArr[messagesArr.length - 1]) : "";

  return parseExtractedMessages(firstMsg, lastMsg);
}

/**
 * Extract user inputs for input spans using the full skeleton-hash + regex
 * extraction pipeline (same as getTraceUserInput in trace-io).
 */
async function extractUserInputsForSpans(
  inputSpanRaws: RawSpanData[],
  projectId: string
): Promise<Record<string, string | null>> {
  const userInputs: Record<string, string | null> = {};
  if (inputSpanRaws.length === 0) return userInputs;

  const parsedSpans: Array<{ spanId: string; parsed: ParsedInput; rawInput: string }> = [];

  for (const raw of inputSpanRaws) {
    const parsed = parseSpanInput(raw.data);
    if (!parsed) {
      userInputs[raw.spanId] = null;
      continue;
    }
    const rawInput = joinUserParts(parsed.userParts);
    if (!rawInput) {
      userInputs[raw.spanId] = null;
      continue;
    }
    parsedSpans.push({ spanId: raw.spanId, parsed, rawInput });
  }

  if (parsedSpans.length === 0) return userInputs;

  // Group spans by whether they have a system prompt
  const withSystem: typeof parsedSpans = [];
  const withoutSystem: typeof parsedSpans = [];
  for (const entry of parsedSpans) {
    if (entry.parsed.systemText) {
      withSystem.push(entry);
    } else {
      withoutSystem.push(entry);
    }
  }

  for (const entry of withoutSystem) {
    userInputs[entry.spanId] = entry.rawInput;
  }

  if (withSystem.length === 0) return userInputs;

  // Batch-hash all system texts
  const systemTexts = withSystem.map((e) => e.parsed.systemText!);
  const hashes = await fetchSkeletonHashes(systemTexts, projectId);

  // Group by hash for batch regex extraction
  const byHash = new Map<string, typeof withSystem>();
  for (let i = 0; i < withSystem.length; i++) {
    const hash = hashes[i];
    if (!hash) {
      userInputs[withSystem[i].spanId] = withSystem[i].rawInput;
      continue;
    }
    const group = byHash.get(hash) ?? [];
    group.push(withSystem[i]);
    byHash.set(hash, group);
  }

  // Run extractInputsForGroup per hash group (uses spanId as the keying id)
  await Promise.all(
    Array.from(byHash.entries()).map(async ([hash, entries]) => {
      const traces = entries.map((e) => ({
        traceId: e.spanId,
        output: null,
        parsed: e.parsed,
      }));
      const groupResults: Record<string, { input: string | null; output: string | null }> = {};
      await extractInputsForGroup(hash, projectId, traces, groupResults);
      for (const entry of entries) {
        userInputs[entry.spanId] = groupResults[entry.spanId]?.input ?? entry.rawInput;
      }
    })
  );

  return userInputs;
}

export interface SpanPreviewsResult {
  previews: SpanPreviewResult;
}

/**
 * Process already-fetched raw span data through the full preview pipeline
 * (classify → cached DB keys → provider matching → LLM generation).
 *
 * Use this when you already have the span output data and want to avoid
 * a redundant ClickHouse fetch.
 */
export async function processSpanPreviews(
  rawSpans: RawSpanData[],
  projectId: string,
  spanIds: string[],
  spanTypes: Record<string, string>,
  options: GetSpanPreviewsOptions = {},
  inputSpanIds?: string[]
): Promise<SpanPreviewsResult> {
  const inputSpanIdSet = new Set(inputSpanIds ?? []);

  // Separate input spans from regular preview spans
  const inputSpanRaws: RawSpanData[] = [];
  const regularSpanRaws: RawSpanData[] = [];

  for (const raw of rawSpans) {
    if (inputSpanIdSet.has(raw.spanId)) {
      inputSpanRaws.push(raw);
    } else {
      regularSpanRaws.push(raw);
    }
  }

  const userInputs = await extractUserInputsForSpans(inputSpanRaws, projectId);

  const regularSpanIds = spanIds.filter((id) => !inputSpanIdSet.has(id));
  const { skipGeneration = false } = options;

  const { resolved: classifiedPreviews, needsProcessing } = classifyRawSpans(regularSpanRaws, spanTypes);

  if (needsProcessing.length === 0) {
    return { previews: { ...fillMissing(classifiedPreviews, regularSpanIds), ...userInputs } };
  }

  const { resolved: cachedPreviews, uncached } = await applyCachedKeys(projectId, needsProcessing);

  const cachedResult = { ...classifiedPreviews, ...cachedPreviews };

  if (uncached.length === 0) {
    return { previews: { ...fillMissing(cachedResult, regularSpanIds), ...userInputs } };
  }

  const { resolved: providerPreviews, needsLlm } = applyProviderMatching(uncached, spanTypes);

  const providerResult = { ...cachedResult, ...providerPreviews };

  if (skipGeneration || needsLlm.length === 0) {
    for (const span of needsLlm) {
      providerResult[span.spanId] = toJsonPreview(span.parsedData);
    }
    return { previews: { ...fillMissing(providerResult, regularSpanIds), ...userInputs } };
  }

  const { resolved: llmPreviews, keysToSave: llmKeys } = await generateAndApplyKeys(needsLlm);

  await saveRenderingKeys(projectId, llmKeys);

  return { previews: { ...fillMissing({ ...providerResult, ...llmPreviews }, regularSpanIds), ...userInputs } };
}

export async function getSpanPreviews(
  input: z.infer<typeof GetSpanPreviewsSchema>,
  options: GetSpanPreviewsOptions = {}
): Promise<SpanPreviewsResult> {
  const { projectId, traceId, spanIds, spanTypes, startDate, endDate, inputSpanIds } =
    GetSpanPreviewsSchema.parse(input);

  const allSpanIds = [...new Set([...spanIds, ...(inputSpanIds ?? [])])];

  const rawSpans = await fetchSpanData(projectId, traceId, allSpanIds, spanTypes, startDate, endDate, inputSpanIds);

  return processSpanPreviews(rawSpans, projectId, spanIds, spanTypes, options, inputSpanIds);
}
