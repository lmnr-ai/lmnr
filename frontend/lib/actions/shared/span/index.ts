import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { events, spans } from "@/lib/db/migrations/schema";

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
        attributes: true,
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
        SELECT input, output
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

  const chData = (await chResult.json()) as [{ input: string; output: string }];
  const { input: spanInput, output: spanOutput } = chData[0] || {};

  return {
    ...dbSpan,
    input: tryParseJson(spanInput),
    output: tryParseJson(spanOutput),
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

  const rows = await db.query.events.findMany({
    where: and(eq(events.spanId, spanId)),
    orderBy: asc(events.timestamp),
  });

  return rows;
};

