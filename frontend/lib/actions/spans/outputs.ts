import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { deepParseJson, tryParseJson } from "@/lib/actions/common/utils.ts";
import { executeQuery } from "@/lib/actions/sql";
import { matchProviderKey } from "@/lib/spans/provider-keys.ts";

import {
  capPayloadSize,
  classifyPayload,
  generateFingerprint,
  truncateFieldValues,
  validateMustacheKey,
} from "./preview-utils.ts";
import { generatePreviewKeys } from "./prompts.ts";

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

// --- Span Preview Generation ---

export const GetSpanPreviewsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.string(),
  traceId: z.string(),
  spanIds: z.array(z.string()).min(1),
  spanTypes: z.record(z.string(), z.string()), // spanId -> spanType
});

type SpanPreviewResult = Record<string, string | null>;

/** Span types that support preview generation */
const PREVIEW_SPAN_TYPES = new Set(["LLM", "CACHED", "TOOL", "EXECUTOR", "EVALUATOR"]);

/** Span types eligible for provider schema matching */
const PROVIDER_SPAN_TYPES = new Set(["LLM", "CACHED"]);

/**
 * Build time-range WHERE conditions for ClickHouse queries.
 */
const buildTimeConditions = (startDate?: string, endDate?: string): string[] => {
  const conditions: string[] = [];
  if (startDate) conditions.push("start_time >= {startDate: String}");
  if (endDate) conditions.push("start_time <= {endDate: String}");
  return conditions;
};

/**
 * Step 1: Fetch output data from ClickHouse for all supported span types.
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

/**
 * Represents a span that has been parsed and needs a preview key.
 */
interface ParsedSpan {
  spanId: string;
  name: string;
  parsedData: Record<string, unknown> | unknown[];
  fingerprint: string;
}

/**
 * Main server action: orchestrates the full preview generation flow (Steps 1-8).
 */
export async function getSpanPreviews(input: z.infer<typeof GetSpanPreviewsSchema>): Promise<SpanPreviewResult> {
  const { projectId, traceId, spanIds, spanTypes, startDate, endDate } = GetSpanPreviewsSchema.parse(input);

  const previews: SpanPreviewResult = {};

  // Step 1: Fetch output data from ClickHouse
  const rawSpans = await fetchSpanData(projectId, traceId, spanIds, spanTypes, startDate, endDate);

  // Step 2: Deep-parse all payloads and classify
  const parsedSpans: ParsedSpan[] = [];

  for (const raw of rawSpans) {
    const classification = classifyPayload(raw.data);

    switch (classification.kind) {
      case "primitive":
      case "raw":
        previews[raw.spanId] = classification.preview;
        break;
      case "empty":
        previews[raw.spanId] = "";
        break;
      case "object": {
        const fingerprint = generateFingerprint(raw.name, classification.data);
        parsedSpans.push({
          spanId: raw.spanId,
          name: raw.name,
          parsedData: classification.data,
          fingerprint,
        });
        break;
      }
    }
  }

  // If all payloads resolved to primitives/empty, return early
  if (parsedSpans.length === 0) {
    // Fill in any spans that weren't found in ClickHouse
    for (const spanId of spanIds) {
      if (!(spanId in previews)) {
        previews[spanId] = "";
      }
    }
    return previews;
  }

  // Step 3: Compute fingerprints (already done above during classification)

  // Step 4: Batch-lookup fingerprints in Postgres
  // NOTE: Postgres queries are commented out until migration is in place.
  // const fingerprints = parsedSpans.map((s) => s.fingerprint);
  // const cachedKeys = await db
  //   .select()
  //   .from(spanRenderingKeys)
  //   .where(
  //     and(
  //       eq(spanRenderingKeys.projectId, projectId),
  //       inArray(spanRenderingKeys.schemaFingerprint, fingerprints)
  //     )
  //   );
  //
  // const fingerprintToKey = new Map<string, string>();
  // for (const row of cachedKeys) {
  //   fingerprintToKey.set(row.schemaFingerprint, row.mustacheKey);
  // }
  //
  // // Apply cached keys
  // const uncachedSpans: ParsedSpan[] = [];
  // for (const span of parsedSpans) {
  //   const cachedKey = fingerprintToKey.get(span.fingerprint);
  //   if (cachedKey) {
  //     previews[span.spanId] = renderMustachePreview(cachedKey, span.parsedData);
  //   } else {
  //     uncachedSpans.push(span);
  //   }
  // }
  //
  // if (uncachedSpans.length === 0) {
  //   for (const spanId of spanIds) {
  //     if (!(spanId in previews)) previews[spanId] = "";
  //   }
  //   return previews;
  // }

  // For now, treat all parsed spans as uncached
  const uncachedSpans = parsedSpans;

  // Step 5: Provider schema matching (LLM/CACHED spans only)
  const needsLlm: ParsedSpan[] = [];
  const keysToSave: Array<{ fingerprint: string; key: string }> = [];

  for (const span of uncachedSpans) {
    if (PROVIDER_SPAN_TYPES.has(spanTypes[span.spanId] ?? "")) {
      const providerKey = matchProviderKey(span.parsedData);
      if (providerKey) {
        const rendered = validateMustacheKey(providerKey, span.parsedData);
        if (rendered) {
          previews[span.spanId] = rendered;
          keysToSave.push({ fingerprint: span.fingerprint, key: providerKey });
          continue;
        }
      }
    }
    needsLlm.push(span);
  }

  // Step 6: LLM generation for remaining misses
  if (needsLlm.length > 0) {
    try {
      // Deduplicate by fingerprint — spans with the same fingerprint share schema shape
      // and will produce the same key, so we only need to send one example per fingerprint.
      const seenFingerprints = new Set<string>();
      const structures: Array<{ fingerprint: string; data: unknown }> = [];
      for (const span of needsLlm) {
        if (!seenFingerprints.has(span.fingerprint)) {
          seenFingerprints.add(span.fingerprint);
          structures.push({
            fingerprint: span.fingerprint,
            data: capPayloadSize(truncateFieldValues(span.parsedData)),
          });
        }
      }

      const results = await generatePreviewKeys(structures);

      // Step 7: Validate mustache keys
      // Group spans by fingerprint so all spans with the same schema shape get a preview
      const fingerprintToSpans = new Map<string, ParsedSpan[]>();
      for (const s of needsLlm) {
        const group = fingerprintToSpans.get(s.fingerprint);
        if (group) {
          group.push(s);
        } else {
          fingerprintToSpans.set(s.fingerprint, [s]);
        }
      }

      for (const result of results) {
        const spans = fingerprintToSpans.get(result.fingerprint);
        if (!spans) continue;

        for (const span of spans) {
          if (result.key) {
            const rendered = validateMustacheKey(result.key, span.parsedData);
            if (rendered) {
              previews[span.spanId] = rendered;
            } else {
              // Validation failed, fall back to JSON stringify
              previews[span.spanId] = JSON.stringify(span.parsedData).slice(0, 500);
            }
          } else {
            // LLM returned null key (error case) — fall back to JSON
            previews[span.spanId] = JSON.stringify(span.parsedData).slice(0, 500);
          }
        }

        // Save the key once per fingerprint
        if (result.key) {
          keysToSave.push({ fingerprint: result.fingerprint, key: result.key });
        }
      }
    } catch (error) {
      // LLM call failed — fall back to JSON for all remaining spans
      console.error("Preview key generation failed:", error);
      for (const span of needsLlm) {
        if (!(span.spanId in previews)) {
          previews[span.spanId] = JSON.stringify(span.parsedData).slice(0, 500);
        }
      }
    }
  }

  // Save keys to Postgres (commented out until migration)
  // if (keysToSave.length > 0) {
  //   try {
  //     await db
  //       .insert(spanRenderingKeys)
  //       .values(
  //         keysToSave.map(({ fingerprint, key }) => ({
  //           projectId,
  //           schemaFingerprint: fingerprint,
  //           mustacheKey: key,
  //         }))
  //       )
  //       .onConflictDoNothing();
  //   } catch (error) {
  //     console.error("Failed to save rendering keys:", error);
  //   }
  // }

  // Step 8: Return previews
  // Fill in any spans that weren't found in ClickHouse or didn't get a preview
  for (const spanId of spanIds) {
    if (!(spanId in previews)) {
      previews[spanId] = "";
    }
  }

  return previews;
}
