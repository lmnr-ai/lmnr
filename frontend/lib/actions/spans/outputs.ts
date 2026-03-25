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

/** Span types whose preview is derived from the OUTPUT side */
const OUTPUT_SPAN_TYPES = new Set(["LLM", "CACHED"]);

/** Span types whose preview is derived from the INPUT side */
const INPUT_SPAN_TYPES = new Set(["TOOL", "EXECUTOR", "EVALUATOR"]);

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
 * Step 1: Fetch data from ClickHouse.
 * Fetches outputs for LLM/CACHED spans and inputs for TOOL/EXECUTOR/EVALUATOR spans.
 */
const fetchSpanData = async (
  projectId: string,
  traceId: string,
  spanIds: string[],
  spanTypes: Record<string, string>,
  startDate?: string,
  endDate?: string
): Promise<{
  outputSpans: Array<{ spanId: string; data: string; name: string }>;
  inputSpans: Array<{ spanId: string; data: string; name: string }>;
}> => {
  const outputSpanIds = spanIds.filter((id) => OUTPUT_SPAN_TYPES.has(spanTypes[id] ?? ""));
  const inputSpanIds = spanIds.filter((id) => INPUT_SPAN_TYPES.has(spanTypes[id] ?? ""));

  const timeConditions = buildTimeConditions(startDate, endDate);

  const [outputSpans, inputSpans] = await Promise.all([
    outputSpanIds.length > 0
      ? executeQuery<{ spanId: string; data: string; name: string }>({
          projectId,
          query: `
            SELECT
              span_id as spanId,
              output as data,
              name
            FROM spans
            WHERE trace_id = {traceId: UUID}
              AND span_id IN {spanIds: Array(UUID)}
              AND span_type IN ('LLM', 'CACHED')
              ${timeConditions.map((c) => `AND ${c}`).join("\n              ")}
          `,
          parameters: { traceId, spanIds: outputSpanIds, startDate, endDate },
        })
      : Promise.resolve([]),
    inputSpanIds.length > 0
      ? executeQuery<{ spanId: string; data: string; name: string }>({
          projectId,
          query: `
            SELECT
              span_id as spanId,
              input as data,
              name
            FROM spans
            WHERE trace_id = {traceId: UUID}
              AND span_id IN {spanIds: Array(UUID)}
              AND span_type IN ('TOOL', 'EXECUTOR', 'EVALUATOR')
              ${timeConditions.map((c) => `AND ${c}`).join("\n              ")}
          `,
          parameters: { traceId, spanIds: inputSpanIds, startDate, endDate },
        })
      : Promise.resolve([]),
  ]);

  return { outputSpans, inputSpans };
};

/**
 * Represents a span that has been parsed and needs a preview key.
 */
interface ParsedSpan {
  spanId: string;
  name: string;
  side: "input" | "output";
  parsedData: Record<string, unknown> | unknown[];
  fingerprint: string;
}

/**
 * Main server action: orchestrates the full preview generation flow (Steps 1-8).
 */
export async function getSpanPreviews(input: z.infer<typeof GetSpanPreviewsSchema>): Promise<SpanPreviewResult> {
  const { projectId, traceId, spanIds, spanTypes, startDate, endDate } = GetSpanPreviewsSchema.parse(input);

  const previews: SpanPreviewResult = {};

  // Step 1: Fetch data from ClickHouse
  const { outputSpans, inputSpans } = await fetchSpanData(projectId, traceId, spanIds, spanTypes, startDate, endDate);

  // Step 2: Deep-parse all payloads and classify
  const parsedSpans: ParsedSpan[] = [];

  const processRawSpans = (
    rawSpans: Array<{ spanId: string; data: string; name: string }>,
    side: "input" | "output"
  ) => {
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
            side,
            parsedData: classification.data,
            fingerprint,
          });
          break;
        }
      }
    }
  };

  processRawSpans(outputSpans, "output");
  processRawSpans(inputSpans, "input");

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

  // Step 3: Compute fingerprints (already done above in processRawSpans)

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
    if (OUTPUT_SPAN_TYPES.has(spanTypes[span.spanId] ?? "")) {
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
      const structures = needsLlm.map((span) => ({
        fingerprint: span.fingerprint,
        side: span.side,
        data: capPayloadSize(truncateFieldValues(span.parsedData)),
      }));

      const results = await generatePreviewKeys(structures);

      // Step 7: Validate mustache keys
      const fingerprintToSpan = new Map(needsLlm.map((s) => [s.fingerprint, s]));

      for (const result of results) {
        const span = fingerprintToSpan.get(result.fingerprint);
        if (!span) continue;

        if (result.key) {
          const rendered = validateMustacheKey(result.key, span.parsedData);
          if (rendered) {
            previews[span.spanId] = rendered;
            keysToSave.push({ fingerprint: span.fingerprint, key: result.key });
          } else {
            // Validation failed, fall back to JSON stringify
            previews[span.spanId] = JSON.stringify(span.parsedData).slice(0, 500);
          }
        } else {
          // LLM returned null key (error case) — fall back to JSON
          previews[span.spanId] = JSON.stringify(span.parsedData).slice(0, 500);
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
