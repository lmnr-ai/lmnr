import { z } from "zod/v4";

import { MAIN_AGENT_SEARCH_WINDOW } from "@/components/traces/trace-view/store/utils";
import { processSpanPreviews } from "@/lib/actions/spans/previews";
import { executeQuery } from "@/lib/actions/sql";
import { fetcherJSON } from "@/lib/utils.ts";

import { extractInputsForGroup, joinUserParts } from "./extract-input";
import { type ParsedInput, parseExtractedMessages } from "./parse-input";

const bodySchema = z.object({
  traceIds: z.array(z.guid()).min(1).max(100),
});

const TOP_PATH_QUERY = `
    SELECT
      path,
      prompt_hash AS promptHash
    FROM (
      SELECT
        path,
        input_tokens,
        start_time,
        simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash') AS prompt_hash
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type = 'LLM'
      ORDER BY start_time ASC
      LIMIT ${MAIN_AGENT_SEARCH_WINDOW}
    )
    GROUP BY path, prompt_hash
    ORDER BY
      length(splitByChar('.', path)) ASC,
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
      AND path = {path: String}
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
    AND path = {path: String}
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
  input: string | null;
  output: string | null;
}

interface TraceWithParsedInput {
  traceId: string;
  output: string | null;
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

  // Back-compat fallback: fill in missing promptHash values by asking app-server
  // to hash the system prompt we already parsed. Once prompt_hash is populated
  // for most spans via the ingest pipeline (app-server/src/traces/utils.rs),
  // this hydration step can be removed together with the /skeleton-hashes
  // endpoint and this function's reliance on parsed.systemText.
  await hydrateMissingPromptHashes(traceData, projectId);

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
      input: joinUserParts(trace.parsed?.userParts ?? []),
      output: trace.output,
    };
  }

  await Promise.all(
    Array.from(bySystemHash.entries()).map(([hash, traces]) => extractInputsForGroup(hash, projectId, traces, results))
  );

  for (const traceId of traceIds) {
    if (!(traceId in results)) {
      results[traceId] = { input: null, output: null };
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

  // Back-compat fallback: older spans don't carry a prompt_hash attribute, so
  // we compute one via app-server from the parsed system text and cache it as
  // the group key for regex extraction. Remove once ingest-time hashing in
  // app-server/src/traces/utils.rs has populated most spans with prompt_hash
  // — then the /skeleton-hashes endpoint and this hydration can go away.
  await hydrateMissingPromptHashes([traceData], projectId);

  // Without a prompt hash there is no group key to cache the regex under, so
  // fall back to the raw user text. This should be rare after hydration.
  if (!traceData.promptHash) return rawInput;

  const results: Record<string, { input: string | null; output: string | null }> = {};
  await extractInputsForGroup(traceData.promptHash, projectId, [traceData], results);

  return results[traceId]?.input ?? rawInput;
}

// ---------------------------------------------------------------------------
// Back-compat: client-side prompt-hash hydration.
//
// app-server computes a `lmnr.span.prompt_hash` attribute at ingest
// (see app-server/src/traces/utils.rs::compute_prompt_hash). For spans that
// pre-date that code path the attribute is missing, so when ClickHouse
// returns no prompt_hash we fall back to asking app-server's
// /projects/{projectId}/skeleton-hashes endpoint to compute it from the
// system text we parsed client-side. This keeps the regex-cache grouping
// working on historical data.
//
// TODO: once ingest-time hashing has backfilled most spans, drop this
// function, the `/skeleton-hashes` route in app-server, and the reliance on
// parsed.systemText in this file. At that point a missing prompt_hash can
// simply short-circuit to returning the raw user input.
// ---------------------------------------------------------------------------

const SKELETON_BATCH_LIMIT = 200; // must stay in sync with app-server's SkeletonHashRequest cap

async function fetchSkeletonHashes(texts: string[], projectId: string): Promise<string[]> {
  try {
    const hashes = await fetcherJSON<string[]>(`/projects/${projectId}/skeleton-hashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
    return Array.isArray(hashes) ? hashes : [];
  } catch {
    return [];
  }
}

async function hydrateMissingPromptHashes(traces: TraceWithParsedInput[], projectId: string): Promise<void> {
  const toHash: { trace: TraceWithParsedInput; systemText: string }[] = [];
  for (const trace of traces) {
    if (trace.promptHash) continue;
    const systemText = trace.parsed?.systemText?.trim();
    if (!systemText) continue;
    toHash.push({ trace, systemText });
  }

  if (toHash.length === 0) return;

  // Dedup identical system prompts so we only pay once per unique text.
  const uniqueTexts = [...new Set(toHash.map((e) => e.systemText))];

  const hashByText = new Map<string, string>();
  for (let offset = 0; offset < uniqueTexts.length; offset += SKELETON_BATCH_LIMIT) {
    const batch = uniqueTexts.slice(offset, offset + SKELETON_BATCH_LIMIT);
    const hashes = await fetchSkeletonHashes(batch, projectId);
    if (hashes.length !== batch.length) continue;
    for (let i = 0; i < batch.length; i++) {
      const hash = hashes[i];
      if (hash) hashByText.set(batch[i], hash);
    }
  }

  for (const { trace, systemText } of toHash) {
    const hash = hashByText.get(systemText);
    if (hash) trace.promptHash = hash;
  }
}

async function fetchTraceInputOnly(traceId: string, projectId: string): Promise<TraceWithParsedInput> {
  const pathRows = await executeQuery<{ path: string; promptHash: string }>({
    query: TOP_PATH_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (pathRows.length === 0) {
    return { traceId, output: null, parsed: null, promptHash: null };
  }

  const { path: topPath, promptHash: topPromptHash } = pathRows[0];

  const inputRows = await executeQuery<InputQueryRow>({
    query: INPUT_QUERY,
    parameters: { traceId, path: topPath, promptHash: topPromptHash ?? "" },
    projectId,
  });

  if (inputRows.length === 0) {
    return { traceId, output: null, parsed: null, promptHash: topPromptHash || null };
  }

  const parsed = parseExtractedMessages(inputRows[0].first_message, inputRows[0].last_message);
  return {
    traceId,
    output: null,
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
    return { traceId, output: null, parsed: null, promptHash: null };
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

  if (inputRows.length === 0) {
    return { traceId, output: outputText, parsed: null, promptHash: topPromptHash || null };
  }

  const parsed = parseExtractedMessages(inputRows[0].first_message, inputRows[0].last_message);
  return {
    traceId,
    output: outputText,
    parsed,
    promptHash: inputRows[0].prompt_hash || topPromptHash || null,
  };
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
