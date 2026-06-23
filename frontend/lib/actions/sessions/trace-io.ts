import { z } from "zod/v4";

import { type TraceViewListSpan } from "@/components/traces/trace-view/store/base";
import { MAIN_AGENT_SEARCH_WINDOW } from "@/components/traces/trace-view/store/utils";
import { processSpanPreviews } from "@/lib/actions/spans/previews";
import { executeQuery } from "@/lib/actions/sql";

import { extractInputsForGroup, fingerprintUserMessage, joinUserParts } from "./extract-input";
import { type ParsedInput, parseExtractedMessages } from "./parse-input";

const bodySchema = z.object({
  traceIds: z.array(z.guid()).min(1).max(100),
});

const TOP_PATH_QUERY = `
    SELECT
      parent_path AS path,
      prompt_hash AS promptHash
    FROM (
      SELECT
        path,
        arrayStringConcat(arrayPopBack(splitByChar('.', path)), '.') AS parent_path,
        input_tokens,
        start_time,
        simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash') AS prompt_hash
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type = 'LLM'
      ORDER BY start_time ASC
      LIMIT ${MAIN_AGENT_SEARCH_WINDOW}
    )
    GROUP BY parent_path, prompt_hash
    ORDER BY
      min(length(splitByChar('.', path))) ASC,
      max(input_tokens) DESC
    LIMIT 1
`;

const INPUT_QUERY = `
  SELECT
    arr[1] AS first_message,
    if(length(arr) > 1, arr[length(arr)], '') AS last_message,
    prompt_hash
  FROM (
    SELECT
      JSONExtractArrayRaw(input) AS arr,
      simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash') AS prompt_hash
    FROM spans
    WHERE trace_id = {traceId: UUID}
      AND span_type = 'LLM'
      AND arrayStringConcat(arrayPopBack(splitByChar('.', path)), '.') = {path: String}
      AND simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash') = {promptHash: String}
    ORDER BY start_time ASC
    LIMIT 1
  )
`;

const OUTPUT_QUERY = `
  SELECT span_id AS spanId, output AS data, name
  FROM spans
  WHERE trace_id = {traceId: UUID}
    AND span_type = 'LLM'
    AND arrayStringConcat(arrayPopBack(splitByChar('.', path)), '.') = {path: String}
    AND simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash') = {promptHash: String}
  ORDER BY start_time DESC
  LIMIT 1
`;

interface InputQueryRow {
  first_message: string;
  last_message: string;
  prompt_hash: string;
}

interface TraceIOResult {
  inputPreview: string | null;
  outputPreview: string | null;
  outputSpan: TraceViewListSpan | null;
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

  // Group by (systemHash, fingerprint). The fingerprint captures the top-level
  // XML-tag structure of the joined user message so traces whose user messages
  // share the same scaffolding
  const byGroupKey = new Map<string, { hash: string; fingerprint: string; traces: TraceWithParsedInput[] }>();
  const noHashTraces: TraceWithParsedInput[] = [];

  for (const trace of traceData) {
    if (!trace.promptHash) {
      noHashTraces.push(trace);
      continue;
    }
    const joined = joinUserParts(trace.parsed?.userParts ?? []);
    const fingerprint = joined ? fingerprintUserMessage(joined) : "empty";
    const groupKey = `${trace.promptHash}::${fingerprint}`;
    const existing = byGroupKey.get(groupKey);
    if (existing) {
      existing.traces.push(trace);
    } else {
      byGroupKey.set(groupKey, { hash: trace.promptHash, fingerprint, traces: [trace] });
    }
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
    Array.from(byGroupKey.values()).map(({ hash, fingerprint, traces }) =>
      extractInputsForGroup(hash, projectId, traces, results, fingerprint)
    )
  );

  for (const traceId of traceIds) {
    if (!(traceId in results)) {
      results[traceId] = { inputPreview: null, outputPreview: null, outputSpan: null };
    }
  }

  const tracesWithOutput = traceData.filter((t) => t.outputSpanId !== null);
  const outputSpanIds = tracesWithOutput.map((t) => t.outputSpanId as string);
  if (outputSpanIds.length > 0) {
    const outputTraceIds = [...new Set(tracesWithOutput.map((t) => t.traceId))];
    const spansById = await fetchSpansByIds(outputSpanIds, outputTraceIds, projectId);
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

  // Without a prompt hash there is no group key to cache the regex under, so
  // fall back to the raw user text.
  if (!traceData.promptHash) return rawInput;

  const results: Record<string, TraceIOResult> = {};
  const fingerprint = fingerprintUserMessage(rawInput);
  await extractInputsForGroup(traceData.promptHash, projectId, [traceData], results, fingerprint);

  return results[traceId]?.inputPreview ?? rawInput;
}

async function fetchTraceInputOnly(traceId: string, projectId: string): Promise<TraceWithParsedInput> {
  const pathRows = await executeQuery<{ path: string; promptHash: string }>({
    query: TOP_PATH_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (pathRows.length === 0) {
    return { traceId, output: null, outputSpanId: null, parsed: null, promptHash: null };
  }

  const { path: topPath, promptHash: topPromptHash } = pathRows[0];

  const inputRows = await executeQuery<InputQueryRow>({
    query: INPUT_QUERY,
    parameters: { traceId, path: topPath, promptHash: topPromptHash ?? "" },
    projectId,
  });

  if (inputRows.length === 0) {
    return { traceId, output: null, outputSpanId: null, parsed: null, promptHash: topPromptHash || null };
  }

  const parsed = parseExtractedMessages(inputRows[0].first_message, inputRows[0].last_message);

  return {
    traceId,
    output: null,
    outputSpanId: null,
    parsed,
    promptHash: inputRows[0].prompt_hash || topPromptHash || null,
  };
}

async function fetchTraceData(traceId: string, projectId: string): Promise<TraceWithParsedInput> {
  const pathRows = await executeQuery<{ path: string; promptHash: string }>({
    query: TOP_PATH_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (pathRows.length === 0) {
    return { traceId, output: null, outputSpanId: null, parsed: null, promptHash: null };
  }

  const { path: topPath, promptHash: topPromptHash } = pathRows[0];

  const [inputRows, outputRows] = await Promise.all([
    executeQuery<InputQueryRow>({
      query: INPUT_QUERY,
      parameters: { traceId, path: topPath, promptHash: topPromptHash ?? "" },
      projectId,
    }),
    executeQuery<{ spanId: string; data: string; name: string }>({
      query: OUTPUT_QUERY,
      parameters: { traceId, path: topPath, promptHash: topPromptHash ?? "" },
      projectId,
    }),
  ]);

  const outputText = await resolveOutput(outputRows, projectId);
  const outputSpanId = outputRows[0]?.spanId ?? null;

  if (inputRows.length === 0) {
    return { traceId, output: outputText, outputSpanId, parsed: null, promptHash: topPromptHash || null };
  }

  const parsed = parseExtractedMessages(inputRows[0].first_message, inputRows[0].last_message);
  return {
    traceId,
    output: outputText,
    outputSpanId,
    parsed,
    promptHash: inputRows[0].prompt_hash || topPromptHash || null,
  };
}

async function fetchSpansByIds(
  spanIds: string[],
  traceIds: string[],
  projectId: string
): Promise<Map<string, TraceViewListSpan>> {
  // Select only the lightweight fields the downstream consumer (`SpanItem`,
  // typed on `TraceViewListSpan`) actually reads. Omitting `input`/`output`/
  // `attributes`/`events` lets the query be served by the IO-excluding
  // `spans_no_io_by_start_time` PROJECTION instead of decompressing the heavy
  // ZSTD columns. `cacheReadInputTokens` is the only attribute-derived field
  // that survives downstream, so extract just that one.
  const query = `
    SELECT
      span_id as spanId,
      parent_span_id as parentSpanId,
      name,
      span_type as spanType,
      input_tokens as inputTokens,
      output_tokens as outputTokens,
      total_cost as totalCost,
      formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
      formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
      status,
      path,
      simpleJSONExtractUInt(attributes, 'gen_ai.usage.cache_read_input_tokens') as cacheReadInputTokens
    FROM spans
    WHERE trace_id IN ({traceIds: Array(UUID)})
      AND span_id IN ({spanIds: Array(UUID)})
  `;

  const rows = await executeQuery<TraceViewListSpan>({
    query,
    parameters: { spanIds, traceIds },
    projectId,
  });

  const map = new Map<string, TraceViewListSpan>();
  for (const row of rows) {
    map.set(row.spanId, row);
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
