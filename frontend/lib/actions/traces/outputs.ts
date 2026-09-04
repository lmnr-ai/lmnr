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
const TOP_PATHS_QUERY = `
    SELECT
      trace_id AS traceId,
      parent_path AS path,
      prompt_hash AS promptHash
    FROM (
      SELECT
        trace_id,
        path,
        arrayStringConcat(arrayPopBack(splitByChar('.', path)), '.') AS parent_path,
        input_tokens,
        start_time,
        simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash') AS prompt_hash
      FROM spans
      WHERE trace_id IN ({traceIds: Array(UUID)})
        AND span_type = 'LLM'
      ORDER BY trace_id ASC, start_time ASC
      LIMIT ${MAIN_AGENT_SEARCH_WINDOW} BY trace_id
    )
    GROUP BY trace_id, parent_path, prompt_hash
    ORDER BY
      min(length(splitByChar('.', path))) ASC,
      max(input_tokens) DESC
    LIMIT 1 BY trace_id
`;

// Last LLM span on each trace's main-agent path — its output is the trace's output.
// `paths` / `promptHashes` are positionally aligned with `traceIds`, and the row's
// expected pair is looked up by indexOf. A composite string key would be shorter but
// needs a separator no span name can contain; the parallel arrays have no such hazard.
const OUTPUTS_QUERY_FALLBACK = `
  SELECT trace_id AS traceId, span_id AS spanId, output AS data, name
  FROM spans
  WHERE trace_id IN ({traceIds: Array(UUID)})
    AND span_type = 'LLM'
    AND arrayElement({paths: Array(String)}, indexOf({traceIds: Array(UUID)}, trace_id))
        = arrayStringConcat(arrayPopBack(splitByChar('.', path)), '.')
    AND arrayElement({promptHashes: Array(String)}, indexOf({traceIds: Array(UUID)}, trace_id))
        = simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash')
  ORDER BY start_time DESC
  LIMIT 1 BY trace_id
`;

interface OutputSpanRow {
  traceId: string;
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
  if (missing.length > 0) {
    const fallback = await resolveTraceOutputTexts(missing, projectId);
    for (const traceId of missing) {
      results[traceId] = fallback[traceId] ?? null;
    }
  }

  return results;
}

/**
 * Legacy path for a batch of traces: two queries total, not two per trace.
 * `LIMIT ... BY trace_id` gives the per-trace top-N/top-1 the single-trace form
 * got from a plain LIMIT.
 */
async function resolveTraceOutputTexts(traceIds: string[], projectId: string): Promise<Record<string, string | null>> {
  const pathRows = await executeQuery<{ traceId: string; path: string; promptHash: string }>({
    query: TOP_PATHS_QUERY,
    parameters: { traceIds },
    projectId,
  });
  if (pathRows.length === 0) return {};

  const outputRows = await executeQuery<OutputSpanRow>({
    query: OUTPUTS_QUERY_FALLBACK,
    parameters: {
      traceIds: pathRows.map((row) => row.traceId),
      paths: pathRows.map((row) => row.path ?? ""),
      promptHashes: pathRows.map((row) => row.promptHash ?? ""),
    },
    projectId,
  });
  if (outputRows.length === 0) return {};

  const spanIds = outputRows.map((row) => row.spanId);
  const spanTypes = Object.fromEntries(spanIds.map((spanId) => [spanId, "LLM"]));
  const { previews } = await processSpanPreviews(outputRows, projectId, spanIds, spanTypes);

  return Object.fromEntries(outputRows.map((row) => [row.traceId, previews[row.spanId] || null]));
}
