import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { spans } from "@/lib/db/migrations/schema";

export const GetSharedSpanSchema = z.object({
  spanId: z.string(),
  traceId: z.string(),
});

export const getSharedSpan = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId } = GetSharedSpanSchema.parse(input);

  const [dbSpan, chResult] = await Promise.all([
    db.query.spans.findFirst({
      where: and(eq(spans.spanId, spanId), eq(spans.traceId, traceId)),
      columns: {
        spanId: true,
        createdAt: true,
        parentSpanId: true,
        name: true,
        spanType: true,
        startTime: true,
        endTime: true,
        traceId: true,
        projectId: true,
        inputUrl: true,
        outputUrl: true,
        status: true,
      },
    }),
    clickhouseClient.query({
      query: `
        SELECT input, output, attributes
        FROM spans
        WHERE span_id = {spanId: UUID} AND trace_id = {traceId: UUID}
        LIMIT 1
      `,
      format: "JSONEachRow",
      query_params: { spanId, traceId },
    }),
  ]);

  if (!dbSpan) {
    throw new Error("Span not found");
  }

  const chData = (await chResult.json()) as [{ input: string; output: string; attributes: string }];
  const { input: spanInput, output: spanOutput, attributes, } = chData[0] || {};

  return {
    ...dbSpan,
    input: tryParseJson(spanInput),
    output: tryParseJson(spanOutput),
    attributes: tryParseJson(attributes) ?? {},
  };
};

export const getSharedSpanEvents = async (input: z.infer<typeof GetSharedSpanSchema>) => {
  const { spanId, traceId } = GetSharedSpanSchema.parse(input);

  // First verify the span exists and belongs to the trace
  const span = await db.query.spans.findFirst({
    where: and(eq(spans.spanId, spanId), eq(spans.traceId, traceId)),
    columns: {
      spanId: true,
    },
  });

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

  const rows = await chResult.json() as { id: string; timestamp: string; spanId: string; name: string; attributes: string }[];

  return rows.map((row) => ({
    ...row,
    timestamp: new Date(`${row.timestamp}Z`),
    attributes: tryParseJson(row.attributes) ?? {},
  }));
};

