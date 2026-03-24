import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { deepParseJson, tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";
import { matchProviderSchema } from "@/lib/spans/provider-keys";

import { generateReaderKeys, type SpanStructure } from "./prompts";
import {
  computeFingerprint,
  isEmptyPayload,
  isPrimitive,
  parseSpanPayload,
  preparePayloadForModel,
  validateMustacheKey,
} from "./reader-utils";

// -- Existing schema + function (used by tree view) --

export const GetSpanOutputsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.string(),
  traceId: z.string(),
  spanIds: z.array(z.string()).min(1),
});

export async function getSpanOutputs(input: z.infer<typeof GetSpanOutputsSchema>): Promise<Record<string, any>> {
  const { projectId, traceId, spanIds, startDate, endDate } = GetSpanOutputsSchema.parse(input);

  const whereConditions = ["trace_id = {traceId: UUID}", "span_id IN {spanIds: Array(UUID)}"];

  if (startDate) {
    whereConditions.push("start_time >= {startDate: String}");
  }

  if (endDate) {
    whereConditions.push("start_time <= {endDate: String}");
  }

  const results = await executeQuery<{ spanId: string; output: string }>({
    projectId,
    query: `
        SELECT
          span_id as spanId,
          output
        FROM spans
        WHERE ${whereConditions.join("\n          AND ")}
      `,
    parameters: {
      traceId,
      projectId,
      spanIds,
      startDate,
      endDate,
    },
  });

  const outputsMap: Record<string, any> = {};

  for (const result of results) {
    outputsMap[result.spanId] = deepParseJson(tryParseJson(result.output));
  }

  return outputsMap;
}

// -- Reader mode: predictive span previews --

const LLM_SPAN_TYPES = new Set(["LLM", "CACHED"]);
const TOOL_SPAN_TYPES = new Set(["TOOL", "EXECUTOR", "EVALUATOR"]);
const MAX_PREVIEW_LENGTH = 200;

export const GetSpanPreviewsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.string(),
  traceId: z.string(),
  spanIds: z.array(z.string()).min(1),
  /** Map from spanId → spanType (e.g. "LLM", "TOOL", "DEFAULT") */
  spanTypes: z.record(z.string(), z.string()),
});

interface SpanData {
  spanId: string;
  name: string;
  spanType: string;
  data: unknown;
  side: "input" | "output";
}

function buildTimeConditions(startDate?: string, endDate?: string): string[] {
  const conditions: string[] = [];
  if (startDate) conditions.push("start_time >= {startDate: String}");
  if (endDate) conditions.push("start_time <= {endDate: String}");
  return conditions;
}

/**
 * Fetch inputs for tool spans and outputs for LLM/cache spans from ClickHouse.
 * Returns parsed data with span metadata.
 */
async function fetchSpanData(
  projectId: string,
  traceId: string,
  spanIds: string[],
  spanTypes: Record<string, string>,
  startDate?: string,
  endDate?: string
): Promise<SpanData[]> {
  const llmSpanIds = spanIds.filter((id) => LLM_SPAN_TYPES.has(spanTypes[id]));
  const toolSpanIds = spanIds.filter((id) => TOOL_SPAN_TYPES.has(spanTypes[id]));

  const baseConditions = ["trace_id = {traceId: UUID}"];
  baseConditions.push(...buildTimeConditions(startDate, endDate));

  const queries: Promise<SpanData[]>[] = [];

  // Fetch outputs for LLM/cache spans
  if (llmSpanIds.length > 0) {
    const whereConditions = [...baseConditions, "span_id IN {llmSpanIds: Array(UUID)}"];
    queries.push(
      executeQuery<{ spanId: string; name: string; spanType: string; output: string }>({
        projectId,
        query: `
          SELECT span_id as spanId, name, span_type as spanType, output
          FROM spans
          WHERE ${whereConditions.join("\n            AND ")}
        `,
        parameters: { traceId, projectId, llmSpanIds, startDate, endDate },
      }).then((rows) =>
        rows.map((r) => ({
          spanId: r.spanId,
          name: r.name,
          spanType: r.spanType,
          data: parseSpanPayload(r.output),
          side: "output" as const,
        }))
      )
    );
  }

  // Fetch inputs for tool spans
  if (toolSpanIds.length > 0) {
    const whereConditions = [...baseConditions, "span_id IN {toolSpanIds: Array(UUID)}"];
    queries.push(
      executeQuery<{ spanId: string; name: string; spanType: string; input: string }>({
        projectId,
        query: `
          SELECT span_id as spanId, name, span_type as spanType, input
          FROM spans
          WHERE ${whereConditions.join("\n            AND ")}
        `,
        parameters: { traceId, projectId, toolSpanIds, startDate, endDate },
      }).then((rows) =>
        rows.map((r) => ({
          spanId: r.spanId,
          name: r.name,
          spanType: r.spanType,
          data: parseSpanPayload(r.input),
          side: "input" as const,
        }))
      )
    );
  }

  const results = await Promise.all(queries);
  return results.flat();
}

// Placeholder: DB lookup for cached fingerprint keys
// TODO: Uncomment when span_rendering_keys table migration is in place
// async function lookupCachedKeys(
//   _projectId: string,
//   _fingerprints: string[]
// ): Promise<Map<string, string>> {
//   return new Map();
// }

// Placeholder: DB save for new fingerprint keys
// TODO: Uncomment when span_rendering_keys table migration is in place
// async function saveCachedKeys(
//   _projectId: string,
//   _entries: Array<{ fingerprint: string; mustacheKey: string }>
// ): Promise<void> {
//   // ON CONFLICT DO NOTHING
// }

function truncatePreview(text: string): string {
  if (text.length <= MAX_PREVIEW_LENGTH) return text;
  return text.slice(0, MAX_PREVIEW_LENGTH) + "…";
}

/**
 * Get span previews using the predictive reader mode flow:
 * 1. Fetch data from ClickHouse (inputs for tools, outputs for LLM/cache)
 * 2. Parse and compute fingerprints
 * 3. Look up cached keys (DB) — commented out until migration
 * 4. Try provider schema matching for LLM spans
 * 5. Call LLM for remaining misses
 * 6. Validate and return previews
 */
export async function getSpanPreviews(
  input: z.infer<typeof GetSpanPreviewsSchema>
): Promise<Record<string, { preview: string; mustacheKey: string } | null>> {
  const { projectId, traceId, spanIds, spanTypes, startDate, endDate } = GetSpanPreviewsSchema.parse(input);

  // 1. Fetch data from ClickHouse
  const spanDataList = await fetchSpanData(projectId, traceId, spanIds, spanTypes, startDate, endDate);

  const results: Record<string, { preview: string; mustacheKey: string } | null> = {};
  const needsLLM: Array<{ spanData: SpanData; fingerprint: string }> = [];

  // 2-4. Process each span
  for (const spanData of spanDataList) {
    const { spanId, name, data, side } = spanData;

    // Skip empty or primitive data
    if (isEmptyPayload(data) || isPrimitive(data)) {
      results[spanId] = null;
      continue;
    }

    const fingerprint = computeFingerprint(name, data);
    if (!fingerprint) {
      results[spanId] = null;
      continue;
    }

    // Step 3: DB lookup — commented out until migration
    // const cachedKeys = await lookupCachedKeys(projectId, [fingerprint]);
    // const cachedKey = cachedKeys.get(fingerprint);
    // if (cachedKey) {
    //   const rendered = validateMustacheKey(cachedKey, data);
    //   if (rendered) {
    //     results[spanId] = { preview: truncatePreview(rendered), mustacheKey: cachedKey };
    //     continue;
    //   }
    // }

    // Step 4: Provider schema matching (LLM spans only, output side)
    if (side === "output" && LLM_SPAN_TYPES.has(spanData.spanType)) {
      const providerKey = matchProviderSchema(data);
      if (providerKey) {
        const rendered = validateMustacheKey(providerKey, data);
        if (rendered) {
          results[spanId] = { preview: truncatePreview(rendered), mustacheKey: providerKey };
          // TODO: Save to DB when migration is in place
          // await saveCachedKeys(projectId, [{ fingerprint, mustacheKey: providerKey }]);
          continue;
        }
      }
    }

    // Step 5: Queue for LLM generation
    needsLLM.push({ spanData, fingerprint });
  }

  // Step 5: Call LLM for remaining misses
  if (needsLLM.length > 0) {
    const structures: SpanStructure[] = needsLLM.map(({ spanData, fingerprint }) => ({
      fingerprint,
      side: spanData.side,
      payload: preparePayloadForModel(spanData.data),
    }));

    // Map fingerprint → spanData entries for result mapping
    const fingerprintToSpans = new Map<string, Array<{ spanData: SpanData; fingerprint: string }>>();
    for (const entry of needsLLM) {
      const list = fingerprintToSpans.get(entry.fingerprint) || [];
      list.push(entry);
      fingerprintToSpans.set(entry.fingerprint, list);
    }

    try {
      const llmResults = await generateReaderKeys(structures);

      for (const result of llmResults) {
        const entries = fingerprintToSpans.get(result.fingerprint);
        if (!entries) continue;

        for (const entry of entries) {
          const { spanData } = entry;

          if (result.key) {
            const rendered = validateMustacheKey(result.key, spanData.data);
            if (rendered) {
              results[spanData.spanId] = { preview: truncatePreview(rendered), mustacheKey: result.key };
              // TODO: Save to DB when migration is in place
              // await saveCachedKeys(projectId, [{ fingerprint: result.fingerprint, mustacheKey: result.key }]);
            } else {
              results[spanData.spanId] = null;
            }
          } else {
            results[spanData.spanId] = null;
          }
        }
      }
    } catch {
      // If LLM call fails, mark all as null
      for (const entry of needsLLM) {
        if (!(entry.spanData.spanId in results)) {
          results[entry.spanData.spanId] = null;
        }
      }
    }
  }

  // Fill in any missing spanIds
  for (const spanId of spanIds) {
    if (!(spanId in results)) {
      results[spanId] = null;
    }
  }

  return results;
}
