import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle.ts";
import { sharedTraces } from "@/lib/db/migrations/schema.ts";
import { type Span } from "@/lib/traces/types.ts";

export const GetSharedSpanSchema = z.object({
  spanId: z.string(),
  traceId: z.string(),
});

export const getSharedSpan = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId } = GetSharedSpanSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

  const [span] = await executeQuery<
    Omit<Span, "attributes" | "events"> & {
      attributes: string;
      events: { timestamp: number; name: string; attributes: string }[];
    }
  >({
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
        attributes,
        events
      FROM spans
      WHERE span_id = {spanId: UUID} AND trace_id = {traceId: UUID}
      LIMIT 1
    `,
    parameters: {
      spanId,
      traceId,
    },
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
    events: (span.events || []).map((event) => ({
      timestamp: event.timestamp,
      name: event.name,
      attributes: tryParseJson(event.attributes) || {},
    })),
  };
};
