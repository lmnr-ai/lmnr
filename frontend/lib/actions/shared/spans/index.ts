import { and, asc, eq } from "drizzle-orm";
import { groupBy } from "lodash";
import z from "zod/v4";

import { GetSharedTraceSchema } from "@/lib/actions/shared/trace";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { spans } from "@/lib/db/migrations/schema";
import { Span } from "@/lib/traces/types";
import { tryParseJson } from "@/lib/utils";

export const getSharedSpans = async (input: z.infer<typeof GetSharedTraceSchema>) => {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const spansResult = (await db
    .select({
      spanId: spans.spanId,
      startTime: spans.startTime,
      endTime: spans.endTime,
      traceId: spans.traceId,
      parentSpanId: spans.parentSpanId,
      name: spans.name,
      attributes: spans.attributes,
      spanType: spans.spanType,
      status: spans.status,
    })
    .from(spans)
    .where(and(eq(spans.traceId, traceId)))
    .orderBy(asc(spans.startTime))) as unknown as Span[];

  if (spansResult.length === 0) {
    return [];
  }

  // Join in memory, because json aggregation and join in PostgreSQL may be too slow
  // depending on the number of spans and events, and there is no way for us
  // to force PostgreSQL to use the correct indexes always.
  const chResult = await clickhouseClient.query({
    query: `
      SELECT id, timestamp, span_id spanId, name, project_id projectId, attributes
      FROM events
      WHERE span_id IN {spanIds: Array(UUID)}
    `,
    format: "JSONEachRow",
    query_params: { spanIds: spansResult.map((span) => span.spanId) },
  });

  const spanEvents = await chResult.json() as { id: string; timestamp: string; spanId: string; name: string; projectId: string; attributes: string }[];

  const spanEventsMap = groupBy(spanEvents, (event) => event.spanId);

  return spansResult.map((span) => ({
    ...span,
    events: (spanEventsMap[span.spanId] || []).map((event) => ({
      ...event,
      timestamp: new Date(`${event.timestamp}Z`).toISOString(),
      attributes: tryParseJson(event.attributes),
    })),
  }));
};
