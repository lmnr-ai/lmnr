import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { searchSpans } from "@/lib/clickhouse/spans";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans, traces } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { getDateRangeFilters } from "@/lib/db/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const pastHours = req.nextUrl.searchParams.get("pastHours");
  const startTime = req.nextUrl.searchParams.get("startDate");
  const endTime = req.nextUrl.searchParams.get("endDate");
  const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;
  const projectId = params.projectId;

  let searchTraceIds = null;
  if (req.nextUrl.searchParams.get("search")) {
    const timeRange = getTimeRange(pastHours ?? undefined, startTime ?? undefined, endTime ?? undefined);
    const searchResult = await searchSpans(projectId, req.nextUrl.searchParams.get("search") ?? "", timeRange);
    searchTraceIds = Array.from(searchResult.traceIds);
  }

  let urlParamFilters: FilterDef[] = [];
  try {
    urlParamFilters = JSON.parse(req.nextUrl.searchParams.get("filter") ?? "[]") as FilterDef[];
  } catch (e) {
    urlParamFilters = [];
  }
  if (!Array.isArray(urlParamFilters)) {
    urlParamFilters = [];
  }

  const topLevelSpans = db
    .select({
      inputPreview: spans.inputPreview,
      outputPreview: spans.outputPreview,
      path: sql<string>`attributes ->> 'lmnr.span.path'`.as("path"),
      name: spans.name,
      spanType: spans.spanType,
      traceId: spans.traceId,
    })
    .from(spans)
    .where(
      and(
        eq(spans.projectId, projectId),
        isNull(spans.parentSpanId),
        ...getDateRangeFilters(startTime, endTime, pastHours)
      )
    )
    .as("top_level_spans");

  const baseQuery = db.$with("traces_info").as(
    db
      .select({
        id: traces.id,
        startTime: traces.startTime,
        endTime: traces.endTime,
        sessionId: traces.sessionId,
        metadata: traces.metadata,
        projectId: traces.projectId,
        inputTokenCount: traces.inputTokenCount,
        outputTokenCount: traces.outputTokenCount,
        totalTokenCount: traces.totalTokenCount,
        hasBrowserSession: traces.hasBrowserSession,
        inputCost: traces.inputCost,
        outputCost: traces.outputCost,
        cost: traces.cost,
        traceType: traces.traceType,
        topSpanInputPreview: topLevelSpans.inputPreview,
        topSpanOutputPreview: topLevelSpans.outputPreview,
        topSpanPath: topLevelSpans.path,
        topSpanName: topLevelSpans.name,
        topSpanType: topLevelSpans.spanType,
        latency: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))`.as("latency"),
      })
      .from(traces)
      .leftJoin(
        topLevelSpans,
        // We could as well join on eq(traces.topSpanId, topLevelSpans.id),
        // but this is more performant, as spans are indexed by traceId
        eq(traces.id, topLevelSpans.traceId)
      )
      .where(
        and(
          eq(traces.projectId, projectId),
          eq(traces.traceType, "DEFAULT"),
          isNotNull(traces.startTime),
          isNotNull(traces.endTime),
          ...getDateRangeFilters(startTime, endTime, pastHours)
        )
      )
  );

  const query = db
    .with(baseQuery)
    .selectDistinctOn([baseQuery.startTime, baseQuery.id], {
      id: baseQuery.id,
      startTime: baseQuery.startTime,
      endTime: baseQuery.endTime,
      sessionId: baseQuery.sessionId,
      metadata: baseQuery.metadata,
      projectId: baseQuery.projectId,
      inputTokenCount: baseQuery.inputTokenCount,
      outputTokenCount: baseQuery.outputTokenCount,
      totalTokenCount: baseQuery.totalTokenCount,
      inputCost: baseQuery.inputCost,
      outputCost: baseQuery.outputCost,
      cost: baseQuery.cost,
      traceType: baseQuery.traceType,
      topSpanInputPreview: baseQuery.topSpanInputPreview,
      topSpanOutputPreview: baseQuery.topSpanOutputPreview,
      topSpanPath: baseQuery.topSpanPath,
      topSpanName: baseQuery.topSpanName,
      topSpanType: baseQuery.topSpanType,
    })
    .from(baseQuery);

  const baseCountQuery = db
    .with(baseQuery)
    .select({
      totalCount: sql<number>`COUNT(DISTINCT(id))`.as("total_count"),
    })
    .from(baseQuery);

  let filters = [eq(baseQuery.projectId, projectId)];
  if (searchTraceIds) {
    filters.push(inArray(baseQuery.id, searchTraceIds));
  }
  const labelFilters = urlParamFilters
    .filter((filter) => filter.column === "labels" && filter.operator === "eq")
    .map((filter) => {
      const labelName = filter.value.split(/=(.*)/)?.[0];
      return inArray(
        sql`id`,
        db
          .select({ id: spans.traceId })
          .from(spans)
          .innerJoin(labels, eq(spans.spanId, labels.spanId))
          .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
          .where(and(eq(labelClasses.name, labelName)))
      );
    });
  const metadataFilters = urlParamFilters
    .filter((filter) => filter.column === "metadata" && filter.operator === "eq")
    .map((filter) => {
      const [key, value] = filter.value.split(/=(.*)/);
      return sql`metadata @> ${JSON.stringify({ [key]: value })}`;
    });
  const otherFilters = urlParamFilters
    .filter((filter) => filter.column !== "labels" && filter.column !== "metadata")
    .map((filter) => {
      if (filter.column === "traceType") {
        filter.castType = "trace_type";
      } else if (filter.column === "spanType") {
        // cast to span_type
        const uppercased = filter.value.toUpperCase().trim();
        filter.value = uppercased === "SPAN" ? "'DEFAULT'" : `'${uppercased}'`;
        filter.castType = "span_type";
      }
      return filter;
    });
  const sqlFilters = filtersToSql(otherFilters, [], {});

  const traceQuery = query
    .where(and(...filters.concat(labelFilters, metadataFilters, sqlFilters)))
    .orderBy(desc(baseQuery.startTime))
    .limit(pageSize)
    .offset(pageNumber * pageSize);
  const countQuery = baseCountQuery.where(and(...filters.concat(labelFilters, metadataFilters, sqlFilters)));

  const [items, totalCount] = await Promise.all([traceQuery, countQuery]);

  return new Response(JSON.stringify({ items, totalCount: totalCount[0].totalCount }), { status: 200 });
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const { searchParams } = new URL(req.url);
  const traceId = searchParams.get("traceId")?.split(",");

  if (!traceId) {
    return new Response("At least one Trace ID is required", { status: 400 });
  }

  try {
    await db.delete(traces).where(and(inArray(traces.id, traceId), eq(traces.projectId, projectId)));

    await db.delete(spans).where(and(inArray(traces.id, traceId), eq(traces.projectId, projectId)));

    return new Response("Traces deleted successfully", { status: 200 });
  } catch (error) {
    return new Response("Error deleting traces", { status: 500 });
  }
}
