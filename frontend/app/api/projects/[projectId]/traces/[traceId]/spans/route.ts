import { and, asc, eq, inArray, not, sql } from "drizzle-orm";
import { partition } from "lodash";
import { NextRequest, NextResponse } from "next/server";

import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { TimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { events, labelClasses, labels, spans } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;
  const searchQuery = req.nextUrl.searchParams.get("search");
  const searchType = req.nextUrl.searchParams.getAll("searchIn");

  const urlParamFilters = (() => {
    try {
      const rawFilters = req.nextUrl.searchParams.getAll("filter").map((f) => JSON.parse(f) as FilterDef);
      return Array.isArray(rawFilters) ? rawFilters : [];
    } catch {
      return [];
    }
  })();

  const [filters, statusFilters] = partition(urlParamFilters, (f) => f.column !== "status");
  const [otherFilters, tagsFilters] = partition(filters, (f) => f.column !== "tags");
  const [regularFilters, modelFilters] = partition(otherFilters, (f) => f.column !== "model");

  const statusSqlFilters = statusFilters.map((filter) => {
    if (filter.value === "success") {
      return filter.operator === "eq" ? sql`status IS NULL` : sql`status IS NOT NULL`;
    } else if (filter.value === "error") {
      return filter.operator === "eq" ? sql`status = 'error'` : sql`status != 'error' OR status IS NULL`;
    }
    return sql`1=1`;
  });

  const modelSqlFilters = modelFilters.map((filter) => {
    const requestModelColumn = sql`(attributes ->> 'gen_ai.request.model')::text`;
    const responseModelColumn = sql`(attributes ->> 'gen_ai.response.model')::text`;

    if (filter.operator === "eq") {
      return sql`(${requestModelColumn} LIKE ${`%${filter.value}%`} OR ${responseModelColumn} LIKE ${`%${filter.value}%`})`;
    } else if (filter.operator === "ne") {
      return sql`((${requestModelColumn} NOT LIKE ${`%${filter.value}%`} OR ${requestModelColumn} IS NULL) AND (${responseModelColumn} NOT LIKE ${`%${filter.value}%`} OR ${responseModelColumn} IS NULL))`;
    }
    return sql`1=1`;
  });

  const tagsSqlFilters = tagsFilters.map((filter) => {
    const name = filter.value;
    const inArrayFilter = inArray(
      spans.spanId,
      db
        .select({ span_id: spans.spanId })
        .from(spans)
        .innerJoin(labels, eq(spans.spanId, labels.spanId))
        .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
        .where(and(eq(labelClasses.name, name)))
    );
    return filter.operator === "eq" ? inArrayFilter : not(inArrayFilter);
  });

  const processedFilters = regularFilters.map((filter) => {
    if (filter.column === "path") {
      filter.column = "(attributes ->> 'lmnr.span.path')";
    } else if (filter.column === "tokens") {
      filter.column = "(attributes ->> 'llm.usage.total_tokens')::int8";
    } else if (filter.column === "cost") {
      filter.column = "(attributes ->> 'gen_ai.usage.cost')::float8";
    }
    return filter;
  });

  const sqlFilters = filtersToSql(
    processedFilters,
    [new RegExp(/^\(attributes\s*->>\s*'[a-zA-Z_\.]+'\)(?:::int8|::float8)?$/)],
    {
      latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`,
    }
  );

  let searchSpanIds: string[] = [];
  if (searchQuery) {
    const timeRange = { pastHours: "all" } as TimeRange;
    const searchResult = await searchSpans({
      projectId,
      searchQuery,
      timeRange,
      traceId,
      searchType: searchType as SpanSearchType[],
    });

    searchSpanIds = Array.from(searchResult.spanIds);
  }

  const spanEventsQuery = db.$with("span_events").as(
    db
      .select({
        eventSpanId: sql`events.span_id`.as("eventSpanId"),
        projectId: events.projectId,
        events: sql`jsonb_agg(jsonb_build_object(
        'id', events.id,
        'spanId', events.span_id,
        'timestamp', events.timestamp,
        'name', events.name,
        'attributes', events.attributes
      ))`.as("events"),
      })
      .from(events)
      .where(
        and(
          eq(events.projectId, projectId),
          // This check may seem redundant because there is a join statement below,
          // but it makes much wiser use of indexes and is much faster (up to 1000x in theory)
          inArray(
            events.spanId,
            sql`(SELECT span_id FROM spans
            WHERE project_id = ${projectId} AND trace_id = ${traceId}
            ${searchSpanIds.length > 0 ? sql`AND span_id IN ${searchSpanIds}` : sql``}
          )`
          )
        )
      )
      .groupBy(events.spanId, events.projectId)
  );

  const spanItems = await db
    .with(spanEventsQuery)
    .select({
      // inputs and outputs are ignored on purpose
      spanId: spans.spanId,
      startTime: spans.startTime,
      endTime: spans.endTime,
      traceId: spans.traceId,
      parentSpanId: spans.parentSpanId,
      name: spans.name,
      attributes: spans.attributes,
      spanType: spans.spanType,
      status: spans.status,
      events: sql`COALESCE(${spanEventsQuery.events}, '[]'::jsonb)`.as("events"),
    })
    .from(spans)
    .leftJoin(
      spanEventsQuery,
      and(eq(spans.spanId, spanEventsQuery.eventSpanId), eq(spans.projectId, spanEventsQuery.projectId))
    )
    .where(
      and(
        eq(spans.traceId, traceId),
        eq(spans.projectId, projectId),
        ...sqlFilters,
        ...statusSqlFilters,
        ...modelSqlFilters,
        ...tagsSqlFilters,
        ...(searchQuery !== null ? [inArray(spans.spanId, searchSpanIds)] : [])
      )
    )
    .orderBy(asc(spans.startTime));

  // For now we flatten the span tree in the front-end if there is a search query,
  // so we explicitly set the parentSpanId to null
  return NextResponse.json(
    spanItems.map((span) => ({
      ...span,
      parentSpanId: searchSpanIds.length > 0 || urlParamFilters.length > 0 ? null : span.parentSpanId,
    }))
  );
}
