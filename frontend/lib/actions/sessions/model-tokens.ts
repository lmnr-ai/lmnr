import { getSessionTraceIds, GetSessionTracesSchema } from "@/lib/actions/sessions";
import { executeQuery } from "@/lib/actions/sql";

export interface ModelTokens {
  model: string;
  tokens: number;
}

// trace_id is the spans primary-key prefix, so this stays a keyed read.
const MODELS_QUERY = `
  SELECT model, sum(total_tokens) AS tokens
  FROM spans
  WHERE trace_id IN ({traceIds: Array(UUID)})
    AND span_type = 'LLM'
    AND model != ''
  GROUP BY model
  ORDER BY tokens DESC
`;

/** Total tokens per model across a session's traces. */
export async function getSessionModelTokens(input: { projectId: string; sessionId: string }): Promise<ModelTokens[]> {
  const { projectId, sessionId } = GetSessionTracesSchema.parse(input);
  const traceIds = await getSessionTraceIds({ projectId, sessionId });
  if (traceIds.length === 0) return [];
  const rows = await executeQuery<{ model: string; tokens: number | string }>({
    query: MODELS_QUERY,
    parameters: { traceIds },
    projectId,
  });
  return rows.map((r) => ({ model: r.model, tokens: Number(r.tokens) }));
}
