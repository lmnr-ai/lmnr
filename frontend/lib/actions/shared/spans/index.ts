import { groupBy } from "lodash";
import z from "zod/v4";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { GetSharedTraceSchema } from "@/lib/actions/shared/trace";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { SpanType } from "@/lib/traces/types.ts";
import { tryParseJson } from "@/lib/utils";

export const getSharedSpans = async (input: z.infer<typeof GetSharedTraceSchema>): Promise<TraceViewSpan[]> => {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const chResult = await clickhouseClient.query({
    query: `
      SELECT 
        span_id as spanId,
        parent_span_id as parentSpanId,
        name,
        CASE
            WHEN span_type = 0 THEN 'DEFAULT'
            WHEN span_type = 1 THEN 'LLM'
            WHEN span_type = 3 THEN 'EXECUTOR'
            WHEN span_type = 4 THEN 'EVALUATOR'
            WHEN span_type = 5 THEN 'EVALUATION'
            WHEN span_type = 6 THEN 'TOOL'
            WHEN span_type = 7 THEN 'HUMAN_EVALUATOR'
            WHEN span_type = 8 THEN 'EVENT'
            ELSE 'UNKNOWN'
        END AS spanType,
        input_tokens as inputTokens,
        output_tokens as outputTokens,
        total_tokens as totalTokens,
        input_cost as inputCost,
        output_cost as outputCost,
        total_cost as totalCost,
        start_time as startTime,
        end_time as endTime,
        trace_id as traceId,
        status,
        attributes
        path
      FROM spans
      WHERE trace_id = {traceId: UUID}
    `,
    format: "JSONEachRow",
    query_params: { traceId },
  });

  const spans = (await chResult.json()) as {
    spanId: string;
    startTime: string;
    endTime: string;
    traceId: string;
    parentSpanId: string;
    name: string;
    attributes: string;
    spanType: SpanType;
    status: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_cost: number;
    output_cost: number;
    total_cost: number;
    path: string;
  }[];

  // Join in memory, because json aggregation and join in PostgreSQL may be too slow
  // depending on the number of spans and events, and there is no way for us
  // to force PostgreSQL to use the correct indexes always.
  const chEvents = await clickhouseClient.query({
    query: `
      SELECT id, timestamp, span_id spanId, name, project_id projectId, attributes
      FROM events
      WHERE span_id IN {spanIds: Array(UUID)}
    `,
    format: "JSONEachRow",
    query_params: { spanIds: spans.map((span) => span.spanId) },
  });

  const events = (await chEvents.json()) as {
    id: string;
    timestamp: string;
    spanId: string;
    name: string;
    projectId: string;
    attributes: string;
  }[];

  const spanEventsMap = groupBy(events, (event) => event.spanId);

  return spans.map((span) => ({
    ...span,
    collapsed: false,
    attributes: tryParseJson(span.attributes) || {},
    parentSpanId: span.parentSpanId === "00000000-0000-0000-0000-000000000000" ? undefined : span.parentSpanId,
    events: (spanEventsMap[span.spanId] || []).map((event) => ({
      ...event,
      timestamp: new Date(`${event.timestamp}Z`).toISOString(),
      attributes: tryParseJson(event.attributes),
    })),
  }));
};
