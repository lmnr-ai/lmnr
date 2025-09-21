import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { SpanType } from "@/lib/traces/types.ts";

export const GetSharedSpanSchema = z.object({
  spanId: z.string(),
  traceId: z.string(),
});

export const getSharedSpan = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId } = GetSharedSpanSchema.parse(input);

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
            start_time as startTime,
            end_time as endTime,
            trace_id as traceId,
            input, 
            output,
            attributes
            status,
        FROM spans
        WHERE span_id = {spanId: UUID} AND trace_id = {traceId: UUID}
        LIMIT 1
      `,
    format: "JSONEachRow",
    query_params: { spanId, traceId },
  });

  const chData = (await chResult.json()) as [
    {
      spanId: string;
      startTime: string;
      endTime: string;
      traceId: string;
      parentSpanId: string;
      name: string;
      attributes: string;
      spanType: SpanType;
      input: string;
      output: string;
      status: string;
    },
  ];
  const [span] = chData;

  return {
    ...span,
    input: tryParseJson(span.input),
    output: tryParseJson(span.output),
    attributes: tryParseJson(span.attributes) ?? {},
  };
};

export const getSharedSpanEvents = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId } = GetSharedSpanSchema.parse(input);

  const chSpan = await clickhouseClient.query({
    query: `
      SELECT span_id as spanId,
      FROM spans
      WHERE span_id = {spanId: UUID} AND trace_id = {traceId: UUID}
    `,
    format: "JSONEachRow",
    query_params: { spanId, traceId },
  });

  const [span] = await chSpan.json();

  if (!span) {
    throw new Error("Span not found or does not belong to the given trace");
  }

  const chResult = await clickhouseClient.query({
    query: `
      SELECT id, timestamp, span_id spanId, name, attributes
      FROM events
      WHERE span_id = {spanId: UUID}
    `,
    format: "JSONEachRow",
    query_params: { spanId },
  });

  const rows = (await chResult.json()) as {
    id: string;
    timestamp: string;
    spanId: string;
    name: string;
    attributes: string;
  }[];

  return rows.map((row) => ({
    ...row,
    timestamp: new Date(`${row.timestamp}Z`),
    attributes: tryParseJson(row.attributes) ?? {},
  }));
};
