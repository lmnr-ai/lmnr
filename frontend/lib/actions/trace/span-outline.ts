import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { truncateForPrompt } from "@/lib/utils";

// One representative span per distinct (name, span_type) shape; enough for an
// LLM to see every structure in the trace without shipping the whole payload.
const MAX_OUTLINE_SPANS = 50;

export const GetTraceSpanOutlineSchema = z.object({
  projectId: z.guid(),
  traceId: z.guid(),
});

export interface TraceSpanOutlineEntry {
  name: string;
  spanType: string;
  occurrences: number;
  path: string;
  model: string;
  input: unknown;
  output: unknown;
  attributes: unknown;
}

/**
 * Compact per-shape outline of a trace for the copy-prompt flow: one
 * representative span per distinct (name, span_type), with all payload values
 * truncated. Deliberately ignores any template whereClause — the LLM needs to
 * see the whole trace to write a filter.
 */
export async function getTraceSpanOutline(
  input: z.infer<typeof GetTraceSpanOutlineSchema>
): Promise<TraceSpanOutlineEntry[]> {
  const { projectId, traceId } = GetTraceSpanOutlineSchema.parse(input);

  // argMin over any(): all sample columns come from the same (earliest) row.
  const rows = await executeQuery<{
    name: string;
    spanType: string;
    occurrences: string | number;
    path: string;
    model: string;
    input: string;
    output: string;
    attributes: string;
  }>({
    projectId,
    query: `
      SELECT
        name,
        span_type AS spanType,
        count() AS occurrences,
        argMin(path, start_time) AS path,
        argMin(model, start_time) AS model,
        argMin(input, start_time) AS input,
        argMin(output, start_time) AS output,
        argMin(attributes, start_time) AS attributes
      FROM spans
      WHERE trace_id = {traceId: UUID}
      GROUP BY name, span_type
      ORDER BY min(start_time)
      LIMIT ${MAX_OUTLINE_SPANS}
    `,
    parameters: { traceId },
  });

  return rows.map((row) => ({
    ...row,
    occurrences: Number(row.occurrences),
    input: truncateForPrompt(row.input),
    output: truncateForPrompt(row.output),
    attributes: truncateForPrompt(row.attributes),
  }));
}
