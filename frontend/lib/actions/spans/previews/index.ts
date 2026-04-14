import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types";
import { parseExtractedMessages } from "@/lib/actions/sessions/parse-input";

import { type AgentNamesResult, resolveAgentNames } from "./agent-names";
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
  inputPreviews?: Record<string, string | null>;
  agentNames?: AgentNamesResult;
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
  const [userInputs, previews] = await Promise.all([
    extractUserInputsForSpans(inputSpanRows ?? [], projectId),
    resolvePreviews(rawSpans, spanIds, spanTypes, projectId, options),
  ]);

  const hasInputPreviews = Object.keys(userInputs).length > 0;
  return {
    previews,
    ...(hasInputPreviews && { inputPreviews: userInputs }),
  };
}

/**
 * Main entry point: fetch span data from ClickHouse, then resolve previews.
 * Also resolves agent names for inputSpanIds that have a system prompt.
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

  const [previewsResult, agentNames] = await Promise.all([
    processSpanPreviews(regularSpans, projectId, spanIds, spanTypes, options, inputSpanRows),
    resolveAgentNamesFromInputRows(inputSpanRows, projectId, options.skipGeneration),
  ]);

  return {
    ...previewsResult,
    ...(Object.keys(agentNames).length > 0 && { agentNames }),
  };
}

async function resolveAgentNamesFromInputRows(
  inputSpanRows: InputSpanRow[],
  projectId: string,
  skipGeneration = false
): Promise<AgentNamesResult> {
  if (inputSpanRows.length === 0) return {};

  const entries = new Map<string, string>();
  for (const row of inputSpanRows) {
    const parsed = parseExtractedMessages(row.firstMessage, row.secondMessage);
    if (parsed?.systemText) {
      entries.set(row.spanId, parsed.systemText);
    }
  }

  if (entries.size === 0) return {};
  return resolveAgentNames(entries, projectId, skipGeneration);
}
