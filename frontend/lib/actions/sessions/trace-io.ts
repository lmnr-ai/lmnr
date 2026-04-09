import { z } from "zod/v4";

import { processSpanPreviews } from "@/lib/actions/spans/previews";
import { executeQuery } from "@/lib/actions/sql";
import { fetcherJSON } from "@/lib/utils";

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
    if(length(arr) > 1, arr[length(arr)], '') AS last_message
  FROM (
    SELECT JSONExtractArrayRaw(input) AS arr
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
  last_message: string;
}

interface TraceIOResult {
  input: string | null;
  output: string | null;
}

interface TraceWithParsedInput {
  traceId: string;
  output: string | null;
  parsed: ParsedInput | null;
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

  const textsToHash: string[] = [];
  const traceIndexByTextIndex: number[] = [];
  for (let i = 0; i < traceData.length; i++) {
    const systemText = traceData[i].parsed?.systemText;
    if (systemText) {
      traceIndexByTextIndex.push(i);
      textsToHash.push(systemText);
    }
  }

  let hashes: string[] = [];
  if (textsToHash.length > 0) {
    hashes = await fetchSkeletonHashes(textsToHash, projectId);
  }

  const bySystemHash = new Map<string, TraceWithParsedInput[]>();
  const noSystemTraces: TraceWithParsedInput[] = [];

  const traceHashMap = new Map<number, string>();
  for (let j = 0; j < traceIndexByTextIndex.length; j++) {
    if (hashes[j]) {
      traceHashMap.set(traceIndexByTextIndex[j], hashes[j]);
    }
  }

  for (let i = 0; i < traceData.length; i++) {
    const trace = traceData[i];
    const hash = traceHashMap.get(i);
    if (!hash) {
      noSystemTraces.push(trace);
      continue;
    }
    const group = bySystemHash.get(hash) ?? [];
    group.push(trace);
    bySystemHash.set(hash, group);
  }

  const results: Record<string, TraceIOResult> = {};

  for (const trace of noSystemTraces) {
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

async function fetchSkeletonHashes(texts: string[], projectId: string): Promise<string[]> {
  try {
    return await fetcherJSON<string[]>(`/projects/${projectId}/skeleton-hashes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts }),
    });
  } catch {
    return [];
  }
}

async function fetchTraceData(traceId: string, projectId: string): Promise<TraceWithParsedInput> {
  const pathRows = await executeQuery<{ path: string }>({
    query: TOP_PATH_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (pathRows.length === 0) {
    return { traceId, output: null, parsed: null };
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

  if (inputRows.length === 0) {
    return { traceId, output: outputText, parsed: null };
  }

  const parsed = parseExtractedMessages(inputRows[0].first_message, inputRows[0].last_message);
  return { traceId, output: outputText, parsed };
}

async function resolveOutput(
  rows: { spanId: string; data: string; name: string }[],
  projectId: string
): Promise<string | null> {
  if (rows.length === 0) return null;
  const { spanId } = rows[0];
  const previews = await processSpanPreviews(rows, projectId, [spanId], { [spanId]: "LLM" });
  return previews[spanId] || null;
}
