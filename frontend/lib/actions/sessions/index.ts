import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { processSessionFilters } from "@/lib/actions/sessions/utils";
import { searchSpans } from "@/lib/clickhouse/spans";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { traces } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { getDateRangeFilters } from "@/lib/db/utils";

export const GetSessionsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export async function getSessions(input: z.infer<typeof GetSessionsSchema>) {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    pageNumber,
    pageSize,
    search,
    searchIn,
    filter: inputFilters,
  } = input;

  const urlParamFilters: FilterDef[] = compact(inputFilters);

  let searchTraceIds = null;
  if (search) {
    const timeRange = getTimeRange(pastHours, startTime, endTime);
    const searchResult = await searchSpans({
      projectId,
      searchQuery: search,
      timeRange,
      searchType: searchIn as SpanSearchType[],
    });
    searchTraceIds = Array.from(searchResult.traceIds);
  }

  const textSearchFilters = searchTraceIds ? [inArray(sql`id`, searchTraceIds)] : [];

  const { whereFilters, havingFilters } = processSessionFilters(urlParamFilters);

  const whereClause = [
    isNotNull(traces.sessionId),
    eq(traces.projectId, projectId),
    ...getDateRangeFilters(startTime || null, endTime || null, pastHours || null),
    ...whereFilters,
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
    .where(and(...whereClause))
    .groupBy(traces.sessionId);

  // Add HAVING clause only if there are aggregate filters
  if (havingFilters.length > 0) {
    query.having(and(...havingFilters));
  }

  const finalQuery = query
    .orderBy(desc(sql`start_time`))
    .offset(pageNumber * pageSize)
    .limit(pageSize);

  const countQuery = db
    .select({
      totalCount: sql<number>`COUNT(DISTINCT(session_id))`.as("total_count"),
    })
    .from(traces)
    .where(and(...whereClause));

  // Also add HAVING to count query if needed
  const baseCountQuery = countQuery;
  if (havingFilters.length > 0) {
    // For count with HAVING, we need to wrap it in a subquery
    const subquery = db
      .select({ sessionId: traces.sessionId })
      .from(traces)
      .where(and(...whereClause))
      .groupBy(traces.sessionId)
      .having(and(...havingFilters));

    const countWithHaving = db
      .select({
        totalCount: sql<number>`COUNT(*)`.as("total_count"),
      })
      .from(subquery.as("filtered_sessions"));

    const [sessions, countResult] = await Promise.all([finalQuery, countWithHaving]);

    return {
      items: sessions,
      totalCount: countResult[0]?.totalCount ?? 0,
    };
  }

  const [sessions, countResult] = await Promise.all([finalQuery, baseCountQuery]);

  return {
    items: sessions,
    totalCount: countResult[0]?.totalCount ?? 0,
  };
}
