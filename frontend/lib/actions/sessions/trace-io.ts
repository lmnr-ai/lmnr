import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { processSpanPreviews } from "@/lib/actions/spans/previews";
import { executeQuery } from "@/lib/actions/sql";
import { type Span } from "@/lib/traces/types";

import { extractInputsForGroup, joinUserParts } from "./extract-input";
import { type ParsedInput, parseExtractedMessages } from "./parse-input";

const bodySchema = z.object({
  traceIds: z.array(z.guid()).min(1).max(100),
});

const TOP_PATH_QUERY = `
    SELECT path
    FROM (
     SELECT path, total_tokens, start_time
     FROM spans
     WHERE trace_id = {traceId: UUID}
       AND span_type = 'LLM'
     ORDER BY start_time ASC
         LIMIT 20
     )
    GROUP BY path
    ORDER BY min(start_time) ASC, sum(total_tokens) DESC
    LIMIT 1
`;

const INPUT_QUERY = `
  SELECT
    arr[1] AS first_message,
    if(length(arr) > 1, arr[2], '') AS second_message,
    prompt_hash
  FROM (
    SELECT
      JSONExtractArrayRaw(input) AS arr,
      simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash') AS prompt_hash
    FROM spans
    WHERE trace_id = {traceId: UUID}
      AND span_type = 'LLM'
      AND path = {path: String}
    ORDER BY start_time ASC
    LIMIT 1
  )
`;

const OUTPUT_QUERY = `
  SELECT span_id AS spanId, output AS data, name
  FROM spans
  WHERE trace_id = {traceId: UUID}
    AND span_type = 'LLM'
    AND path = {path: String}
  ORDER BY start_time DESC
  LIMIT 1
`;

interface InputQueryRow {
  first_message: string;
  second_message: string;
  prompt_hash: string;
}

interface TraceIOResult {
  inputPreview: string | null;
  outputPreview: string | null;
  outputSpan: Span | null;
}

interface TraceWithParsedInput {
  traceId: string;
  output: string | null;
  outputSpanId: string | null;
  parsed: ParsedInput | null;
  promptHash: string | null;
}

export async function getMainAgentIOBatch({
  traceIds,
  projectId,
}: {
  traceIds: string[];
  projectId: string;
}): Promise<Record<string, TraceIOResult>> {
  const parsed = bodySchema.parse({ traceIds });

  const traceData = await Promise.all(parsed.traceIds.map((traceId) => fetchTraceData(traceId, projectId)));

  const bySystemHash = new Map<string, TraceWithParsedInput[]>();
  const noHashTraces: TraceWithParsedInput[] = [];

  for (const trace of traceData) {
    if (!trace.promptHash) {
      noHashTraces.push(trace);
      continue;
    }
    const group = bySystemHash.get(trace.promptHash) ?? [];
    group.push(trace);
    bySystemHash.set(trace.promptHash, group);
  }

  const results: Record<string, TraceIOResult> = {};

  for (const trace of noHashTraces) {
    results[trace.traceId] = {
      inputPreview: joinUserParts(trace.parsed?.userParts ?? []),
      outputPreview: trace.output,
      outputSpan: null,
    };
  }

  await Promise.all(
    Array.from(bySystemHash.entries()).map(([hash, traces]) => extractInputsForGroup(hash, projectId, traces, results))
  );

  for (const traceId of traceIds) {
    if (!(traceId in results)) {
      results[traceId] = { inputPreview: null, outputPreview: null, outputSpan: null };
    }
  }

  const outputSpanIds = traceData.map((t) => t.outputSpanId).filter((id): id is string => id !== null);
  if (outputSpanIds.length > 0) {
    const spansById = await fetchSpansByIds(outputSpanIds, projectId);
    for (const t of traceData) {
      if (t.outputSpanId && results[t.traceId]) {
        results[t.traceId].outputSpan = spansById.get(t.outputSpanId) ?? null;
      }
    }
  }

  return results;
}

/**
 * Extract the user input for a single trace using the main-agent detection
 * pipeline (top LLM path -> parse messages -> regex extraction).
 */
export async function getTraceUserInput(traceId: string, projectId: string): Promise<string | null> {
  const traceData = await fetchTraceInputOnly(traceId, projectId);
  if (!traceData.parsed) return null;

  const rawInput = joinUserParts(traceData.parsed.userParts);
  if (!rawInput) return null;

  if (!traceData.promptHash) return rawInput;

  const results: Record<string, TraceIOResult> = {};
  await extractInputsForGroup(traceData.promptHash, projectId, [traceData], results);

  return results[traceId]?.inputPreview ?? rawInput;
}

async function fetchTraceInputOnly(traceId: string, projectId: string): Promise<TraceWithParsedInput> {
  const pathRows = await executeQuery<{ path: string }>({
    query: TOP_PATH_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (pathRows.length === 0) {
    return { traceId, output: null, outputSpanId: null, parsed: null, promptHash: null };
  }

  const topPath = pathRows[0].path;

  const inputRows = await executeQuery<InputQueryRow>({
    query: INPUT_QUERY,
    parameters: { traceId, path: topPath },
    projectId,
  });

  if (inputRows.length === 0) {
    return { traceId, output: null, outputSpanId: null, parsed: null, promptHash: null };
  }

  const parsed = parseExtractedMessages(inputRows[0].first_message, inputRows[0].second_message);
  return { traceId, output: null, outputSpanId: null, parsed, promptHash: inputRows[0].prompt_hash || null };
}

async function fetchTraceData(traceId: string, projectId: string): Promise<TraceWithParsedInput> {
  const pathRows = await executeQuery<{ path: string }>({
    query: TOP_PATH_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (pathRows.length === 0) {
    return { traceId, output: null, outputSpanId: null, parsed: null, promptHash: null };
  }

  const topPath = pathRows[0].path;

  const [inputRows, outputRows] = await Promise.all([
    executeQuery<InputQueryRow>({
      query: INPUT_QUERY,
      parameters: { traceId, path: topPath },
      projectId,
    }),
    executeQuery<{ spanId: string; data: string; name: string }>({
      query: OUTPUT_QUERY,
      parameters: { traceId, path: topPath },
      projectId,
    }),
  ]);

  const outputText = await resolveOutput(outputRows, projectId);
  const outputSpanId = outputRows[0]?.spanId ?? null;

  if (inputRows.length === 0) {
    return { traceId, output: outputText, outputSpanId, parsed: null, promptHash: null };
  }

  const parsed = parseExtractedMessages(inputRows[0].first_message, inputRows[0].second_message);
  return { traceId, output: outputText, outputSpanId, parsed, promptHash: inputRows[0].prompt_hash || null };
}

async function fetchSpansByIds(spanIds: string[], projectId: string): Promise<Map<string, Span>> {
  const query = `
    SELECT
      span_id as spanId,
      parent_span_id as parentSpanId,
      name,
      span_type as spanType,
      input_tokens as inputTokens,
      output_tokens as outputTokens,
      total_tokens as totalTokens,
      input_cost as inputCost,
      output_cost as outputCost,
      total_cost as totalCost,
      formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
      formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
      trace_id as traceId,
      status,
      input,
      output,
      path,
      attributes,
      events
    FROM spans
    WHERE span_id IN ({spanIds: Array(UUID)})
  `;

  const rows = await executeQuery<
    Omit<Span, "attributes" | "events" | "cacheReadInputTokens" | "reasoningTokens"> & {
      attributes: string;
      events: { timestamp: number; name: string; attributes: string }[];
    }
  >({
    query,
    parameters: { spanIds },
    projectId,
  });

  const map = new Map<string, Span>();
  for (const row of rows) {
    const parsedAttributes = tryParseJson(row.attributes) || {};
    map.set(row.spanId, {
      ...row,
      input: tryParseJson(row.input),
      output: tryParseJson(row.output),
      attributes: parsedAttributes,
      cacheReadInputTokens: parsedAttributes["gen_ai.usage.cache_read_input_tokens"] || 0,
      reasoningTokens: parsedAttributes["gen_ai.usage.reasoning_tokens"] || 0,
      events: (row.events || []).map((event) => ({
        timestamp: event.timestamp,
        name: event.name,
        attributes: tryParseJson(event.attributes) || {},
      })),
    });
  }
  return map;
}

async function resolveOutput(
  rows: { spanId: string; data: string; name: string }[],
  projectId: string
): Promise<string | null> {
  if (rows.length === 0) return null;
  const { spanId } = rows[0];
  const result = await processSpanPreviews(rows, projectId, [spanId], { [spanId]: "LLM" });
  return result.previews[spanId] || null;
}
