import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

// Hard cap on rows shipped to a trace template; guards against unselective
// filters on huge traces (payload columns are the expensive bytes).
const MAX_TRACE_RENDER_SPANS = 256;

export const GetTraceRenderDataSchema = z.object({
  projectId: z.guid(),
  traceId: z.guid(),
  whereClause: z.string().nullish(),
});

export interface TraceRenderSpan {
  spanId: string;
  parentSpanId: string;
  name: string;
  path: string;
  spanType: string;
  startTime: string;
  endTime: string;
  status: string;
  model: string;
  input: unknown;
  output: unknown;
  attributes: unknown;
}

export interface TraceRenderData {
  spans: TraceRenderSpan[];
  truncated: boolean;
}

const tryParse = (value: unknown): unknown => {
  if (typeof value !== "string" || value === "") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Fetches the spans a trace-scoped render template needs. The user-authored
 * `whereClause` fragment is composed into the statement verbatim; safety comes
 * from the app-server query-engine validator (SELECT-only, project-scoped
 * `spans_v0` rewrite, blocked functions), which every `executeQuery` call
 * passes through — same trust model as the SQL editor.
 */
export async function getTraceRenderData(input: z.infer<typeof GetTraceRenderDataSchema>): Promise<TraceRenderData> {
  const { projectId, traceId, whereClause } = GetTraceRenderDataSchema.parse(input);

  const filter = whereClause?.trim() ? `AND (${whereClause})` : "";

  const rows = await executeQuery<{
    spanId: string;
    parentSpanId: string;
    name: string;
    path: string;
    spanType: string;
    startTime: string;
    endTime: string;
    status: string;
    model: string;
    input: string;
    output: string;
    attributes: string;
  }>({
    projectId,
    query: `
      SELECT
        span_id AS spanId,
        parent_span_id AS parentSpanId,
        name,
        path,
        span_type AS spanType,
        start_time AS startTime,
        end_time AS endTime,
        status,
        model,
        input,
        output,
        attributes
      FROM spans
      WHERE trace_id = {traceId: UUID}
      ${filter}
      ORDER BY start_time
      LIMIT ${MAX_TRACE_RENDER_SPANS + 1}
    `,
    parameters: { traceId },
  });

  const truncated = rows.length > MAX_TRACE_RENDER_SPANS;
  const spans = (truncated ? rows.slice(0, MAX_TRACE_RENDER_SPANS) : rows).map((row) => ({
    ...row,
    input: tryParse(row.input),
    output: tryParse(row.output),
    attributes: tryParse(row.attributes),
  }));

  return { spans, truncated };
}
