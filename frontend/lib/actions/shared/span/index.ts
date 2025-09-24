import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle.ts";
import { sharedTraces } from "@/lib/db/migrations/schema.ts";
import { Span } from "@/lib/traces/types.ts";

export const GetSharedSpanSchema = z.object({
  spanId: z.string(),
  traceId: z.string(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const getSharedSpan = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId, startTime, endTime } = GetSharedSpanSchema.parse(input);

  const whereConditions = [`span_id = {spanId: UUID}`, `trace_id = {traceId: UUID}`];
  const parameters: Record<string, any> = { spanId, traceId };

  if (startTime) {
    whereConditions.push(`start_time >= {startTime: String}`);
    parameters.startTime = startTime.replace("Z", "");
  }

  if (endTime) {
    whereConditions.push(`start_time <= {endTime: String}`);
    parameters.endTime = endTime.replace("Z", "");
  }

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

  const [span] = await executeQuery<Omit<Span, "attributes"> & { attributes: string }>({
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
        input,
        output,
        path,
        attributes
      FROM spans
      WHERE ${whereConditions.join(" AND ")}
      LIMIT 1
    `,
    parameters,
    projectId: sharedTrace.projectId,
  });

  if (!span) {
    throw new Error("No span found.");
  }

  return {
    ...span,
    input: tryParseJson(span.input),
    output: tryParseJson(span.output),
    attributes: tryParseJson(span.attributes) ?? {},
  };
};

export const getSharedSpanEvents = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId } = GetSharedSpanSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

  // Check if span really belongs to trace.
  const [spanExists] = await executeQuery<{ exists: number }>({
    query: `
      SELECT 1 as exists
      FROM spans
      WHERE span_id = {spanId: UUID} AND trace_id = {traceId: UUID}
      LIMIT 1
    `,
    parameters: { spanId, traceId },
    projectId: sharedTrace.projectId,
  });

  if (!spanExists) {
    throw new Error("Span not found or does not belong to the given trace");
  }

  const events = await executeQuery<{
    id: string;
    timestamp: string;
    spanId: string;
    name: string;
    attributes: string;
  }>({
    query: `
      SELECT id, formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp, span_id spanId, name, attributes
      FROM events
      WHERE span_id = {spanId: UUID}
    `,
    parameters: { spanId },
    projectId: sharedTrace.projectId,
  });

  return events.map((row) => ({
    ...row,
    attributes: tryParseJson(row.attributes) ?? {},
  }));
};
