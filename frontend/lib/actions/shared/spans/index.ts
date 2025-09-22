import { eq } from "drizzle-orm";
import { groupBy } from "lodash";
import z from "zod/v4";

import { TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { GetSharedTraceSchema } from "@/lib/actions/shared/trace";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle.ts";
import { sharedTraces } from "@/lib/db/migrations/schema.ts";
import { tryParseJson } from "@/lib/utils";

export const getSharedSpans = async (input: z.infer<typeof GetSharedTraceSchema>): Promise<TraceViewSpan[]> => {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

  const spans = await executeQuery<Omit<TraceViewSpan, "attributes"> & { attributes: string }>({
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
        attributes,
        path
      FROM spans
      WHERE trace_id = {traceId: UUID}
    `,
    parameters: {
      traceId,
    },
    projectId: sharedTrace.projectId,
  });

  if (spans.length === 0) {
    return [];
  }

  const events = await executeQuery<{
    id: string;
    timestamp: string;
    spanId: string;
    name: string;
    projectId: string;
    attributes: string;
  }>({
    query: `
      SELECT id, timestamp, span_id spanId, name, attributes
      FROM events
      WHERE span_id IN {spanIds: Array(UUID)}
    `,
    parameters: {
      spanIds: spans.map((span) => span.spanId),
    },
    projectId: sharedTrace.projectId,
  });

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
