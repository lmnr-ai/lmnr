import { z } from "zod/v4";

import { MAIN_AGENT_SEARCH_WINDOW } from "@/components/traces/trace-view/store/utils";
import { processSpanPreviews } from "@/lib/actions/spans/previews";
import { executeQuery } from "@/lib/actions/sql";

const bodySchema = z.object({
  traceIds: z.array(z.guid()).min(1).max(100),
});

// The main-agent LLM path within a trace: the shallowest parent path with the
// most input tokens among the first N LLM spans. Mirrors the app-server
// compression boundary heuristic (arrayPopBack of the '.'-split span path).
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

// Last LLM span on the main-agent path — its output is the trace's output.
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

interface OutputSpanRow {
  spanId: string;
  data: string;
  name: string;
}

/**
 * Fallback trace-output resolver used when the ingestion-time-extracted
 * `agent_output` (`traces_v0.agent_output`) is empty. Resolves the output TEXT
 * only (no span payload) from the last LLM span on the trace's main-agent path,
 * mirroring the pre-`agent_output` behaviour. Batched (one query pair per
 * trace, in parallel). Returns a map traceId -> output text (or null).
 */
export async function getTraceOutputTextBatch({
  traceIds,
  projectId,
}: {
  traceIds: string[];
  projectId: string;
}): Promise<Record<string, string | null>> {
  const parsed = bodySchema.parse({ traceIds });

  const entries = await Promise.all(
    parsed.traceIds.map(async (traceId) => [traceId, await resolveTraceOutputText(traceId, projectId)] as const)
  );

  return Object.fromEntries(entries);
}

async function resolveTraceOutputText(traceId: string, projectId: string): Promise<string | null> {
  const pathRows = await executeQuery<{ path: string; promptHash: string }>({
    query: TOP_PATH_QUERY,
    parameters: { traceId },
    projectId,
  });
  if (pathRows.length === 0) return null;

  const { path: topPath, promptHash: topPromptHash } = pathRows[0];

  const outputRows = await executeQuery<OutputSpanRow>({
    query: OUTPUT_QUERY,
    parameters: { traceId, path: topPath, promptHash: topPromptHash ?? "" },
    projectId,
  });

  return resolveOutput(outputRows, projectId);
}

async function resolveOutput(rows: OutputSpanRow[], projectId: string): Promise<string | null> {
  if (rows.length === 0) return null;
  const { spanId } = rows[0];
  const result = await processSpanPreviews(rows, projectId, [spanId], { [spanId]: "LLM" });
  return result.previews[spanId] || null;
}
