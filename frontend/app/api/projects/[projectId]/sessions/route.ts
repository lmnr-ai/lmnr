import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

import { searchSpans } from "@/lib/clickhouse/spans";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { labelClasses, labels, spans, traces } from "@/lib/db/migrations/schema";
import { FilterDef, filtersToSql } from "@/lib/db/modifiers";
import { getDateRangeFilters } from "@/lib/db/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  const pastHours = req.nextUrl.searchParams.get("pastHours");
  const startTime = req.nextUrl.searchParams.get("startDate");
  const endTime = req.nextUrl.searchParams.get("endDate");
  const pageNumber = parseInt(req.nextUrl.searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50") || 50;

  let urlParamFilters: FilterDef[] = [];
  try {
    urlParamFilters = JSON.parse(req.nextUrl.searchParams.get("filter") ?? "[]") as FilterDef[];
  } catch (e) {
    urlParamFilters = [];
  }
  if (!Array.isArray(urlParamFilters)) {
    urlParamFilters = [];
  }

  let searchTraceIds = null;
  if (req.nextUrl.searchParams.get("search")) {
    const timeRange = getTimeRange(pastHours ?? undefined, startTime ?? undefined, endTime ?? undefined);
    const searchResult = await searchSpans(projectId, req.nextUrl.searchParams.get("search") ?? "", timeRange);
    searchTraceIds = Array.from(searchResult.traceIds);
  }

  const textSearchFilters = searchTraceIds ? [inArray(sql`id`, searchTraceIds)] : [];
  const labelFilters = urlParamFilters
    .filter((filter) => filter.column === "labels" && filter.operator === "eq")
    .map((filter) => {
      const labelName = filter.value.split(/=(.*)/)?.[0];
      return inArray(
        sql`trace_id`,
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
  const sqlFilters = filtersToSql(otherFilters, [new RegExp(/^(?:::int8|::float8)?$/)], {
    duration: sql<number>`EXTRACT(EPOCH FROM (end_time - start_time))::float8`,
  });

  const filters = [
    isNotNull(traces.sessionId),
    eq(traces.projectId, projectId),
    ...getDateRangeFilters(startTime, endTime, pastHours),
    ...labelFilters,
    ...metadataFilters,
    ...sqlFilters,
    ...textSearchFilters,
  ];

  const query = db
    .select({
      id: traces.sessionId,
      traceCount: sql<number>`COUNT(id)::int8`.as("trace_count"),
      inputTokenCount: sql<number>`SUM(input_token_count)::int8`.as("input_token_count"),
      outputTokenCount: sql<number>`SUM(output_token_count)::int8`.as("output_token_count"),
      totalTokenCount: sql<number>`SUM(total_token_count)::int8`.as("total_token_count"),
      startTime: sql<number>`MIN(start_time)`.as("start_time"),
      endTime: sql<number>`MAX(end_time)`.as("end_time"),
      duration: sql<number>`SUM(EXTRACT(EPOCH FROM (end_time - start_time)))::float8`.as("duration"),
      inputCost: sql<number>`SUM(input_cost)::float8`.as("input_cost"),
      outputCost: sql<number>`SUM(output_cost)::float8`.as("output_cost"),
      cost: sql<number>`SUM(cost)::float8`.as("cost"),
    })
    .from(traces)
    .where(and(...filters))
    .groupBy(traces.sessionId)
    .orderBy(desc(sql`start_time`))
    .offset(pageNumber * pageSize)
    .limit(pageSize);

  const countQuery = db
    .select({
      totalCount: sql<number>`COUNT(DISTINCT(id))`.as("total_count"),
    })
    .from(traces)
    .where(and(...filters));

  const [items, totalCount] = await Promise.all([query, countQuery]);

  return new Response(JSON.stringify({ items, totalCount: totalCount[0].totalCount }), { status: 200 });
}
