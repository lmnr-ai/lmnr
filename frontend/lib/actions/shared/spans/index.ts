import { eq } from "drizzle-orm";
import { groupBy } from "lodash";
import type z from "zod/v4";

import { type TraceViewSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { GetSharedTraceSchema } from "@/lib/actions/shared/trace";
import { aggregateSpanMetrics } from "@/lib/actions/spans/utils.ts";
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
        span_type as spanType,
        input_tokens as inputTokens,
        output_tokens as outputTokens,
        total_tokens as totalTokens,
        input_cost as inputCost,
        output_cost as outputCost,
        total_cost as totalCost,
        formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
        formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
        trace_id as traceId,
        status,
        attributes,
        path,
        model
      FROM spans
      WHERE trace_id = {traceId: UUID}
      ORDER BY start_time ASC
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
      SELECT id, formatDateTime(timestamp , '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp, span_id spanId, name, attributes
      FROM events
      WHERE trace_id = {traceId: UUID}
    `,
    parameters: {
      traceId,
    },
    projectId: sharedTrace.projectId,
  });

  const spanEventsMap = groupBy(events, (event) => event.spanId);

  const transformedSpans = spans.map((span) => {
    const parsedAttributes = tryParseJson(span.attributes) || {};
    const cacheReadInputTokens = parsedAttributes["gen_ai.usage.cache_read_input_tokens"] || 0;

    return {
      ...span,
      collapsed: false,
      attributes: parsedAttributes,
      cacheReadInputTokens,
      parentSpanId: span.parentSpanId === "00000000-0000-0000-0000-000000000000" ? undefined : span.parentSpanId,
      events: (spanEventsMap[span.spanId] || []).map((event) => ({
        ...event,
        attributes: tryParseJson(event.attributes),
      })),
    };
  });

  return aggregateSpanMetrics(transformedSpans);
};
