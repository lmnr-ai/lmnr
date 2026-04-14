import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types";

import { extractUserInputsForSpans } from "./input-extraction";
import { fetchSpanData, type InputSpanRow, PREVIEW_SPAN_TYPES } from "./queries";
import { type ResolveOptions, resolvePreviews, type SpanPreviewResult } from "./resolve";

export { PREVIEW_SPAN_TYPES };
export type { SpanPreviewResult };

export const GetSpanPreviewsSchema = TimeRangeSchema.omit({ pastHours: true }).extend({
  projectId: z.guid(),
  traceId: z.guid(),
  spanIds: z.array(z.string()).min(1),
  spanTypes: z.record(z.string(), z.string()),
  inputSpanIds: z.array(z.string()).optional(),
});

export interface RawSpanData {
  spanId: string;
  data: string;
  name: string;
}

export interface SpanPreviewsResult {
  previews: SpanPreviewResult;
}

/**
 * Process already-fetched raw span data through the preview pipeline.
 * Use this when you already have span output data and want to skip a redundant ClickHouse fetch.
 */
export async function processSpanPreviews(
  rawSpans: RawSpanData[],
  projectId: string,
  spanIds: string[],
  spanTypes: Record<string, string>,
  options: ResolveOptions = {},
  inputSpanRows?: InputSpanRow[]
): Promise<SpanPreviewsResult> {
  const inputSpanIdSet = new Set((inputSpanRows ?? []).map((r) => r.spanId));
  const regularSpanIds = spanIds.filter((id) => !inputSpanIdSet.has(id));

  const [userInputs, previews] = await Promise.all([
    extractUserInputsForSpans(inputSpanRows ?? [], projectId),
    resolvePreviews(rawSpans, regularSpanIds, spanTypes, projectId, options),
  ]);

  return { previews: { ...previews, ...userInputs } };
}

/**
 * Main entry point: fetch span data from ClickHouse, then resolve previews.
 */
export async function getSpanPreviews(
  input: z.infer<typeof GetSpanPreviewsSchema>,
  options: ResolveOptions = {}
): Promise<SpanPreviewsResult> {
  const { projectId, traceId, spanIds, spanTypes, startDate, endDate, inputSpanIds } =
    GetSpanPreviewsSchema.parse(input);

  const allSpanIds = [...new Set([...spanIds, ...(inputSpanIds ?? [])])];

  const { regularSpans, inputSpanRows } = await fetchSpanData(
    projectId,
    traceId,
    allSpanIds,
    spanTypes,
    startDate,
    endDate,
    inputSpanIds
  );

  return processSpanPreviews(regularSpans, projectId, spanIds, spanTypes, options, inputSpanRows);
}
