import { z } from "zod/v4";

import { MAIN_AGENT_SEARCH_WINDOW } from "@/components/traces/trace-view/store/utils";
import { processSpanPreviews } from "@/lib/actions/spans/previews";
import { executeQuery } from "@/lib/actions/sql";
import { extractAgentOutput } from "@/lib/traces/agent-output";

const bodySchema = z.object({
  traceIds: z.array(z.guid()).min(1).max(100),
});

// Primary source: the `trace_outputs` view (backed by the ingestion-time
// `trace_agent_output` RMT). `agent_output` is the winning LLM span's full
// output-message array, one raw message JSON per element.
const OUTPUTS_QUERY = `
  SELECT trace_id AS traceId, agent_output AS agentOutput
  FROM trace_outputs
  WHERE trace_id IN ({traceIds: Array(UUID)})
`;

// Fallback for traces ingested before `trace_agent_output` existed: the
// main-agent LLM path within a trace — the shallowest parent path with the
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
 * Resolve trace-output text for a batch of traces. Primary path is one
 * query-engine read over the `trace_outputs` view + `extractAgentOutput`
 * (text / thinking / tool calls); traces without a row (ingested before the
 * `trace_agent_output` table existed) fall back to the output of the last
 * LLM span on the trace's main-agent path. Returns a map
 * traceId -> output text (or null).
 */
export async function getAgentOutputsBatch({
  traceIds,
  projectId,
}: {
  traceIds: string[];
  projectId: string;
}): Promise<Record<string, string | null>> {
  const parsed = bodySchema.parse({ traceIds });

  const rows = await executeQuery<{ traceId: string; agentOutput: string[] }>({
    query: OUTPUTS_QUERY,
    parameters: { traceIds: parsed.traceIds },
    projectId,
  });

  const results: Record<string, string | null> = {};
  for (const row of rows) {
    results[row.traceId] = extractAgentOutput(row.agentOutput);
  }

  const missing = parsed.traceIds.filter((id) => !results[id]);
  const fallbackEntries = await Promise.all(
    missing.map(async (traceId) => [traceId, await resolveTraceOutputText(traceId, projectId)] as const)
  );
  for (const [traceId, text] of fallbackEntries) {
    results[traceId] = text;
  }

  return results;
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
