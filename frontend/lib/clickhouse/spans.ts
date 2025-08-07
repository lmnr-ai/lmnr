import { clickhouseClient } from "@/lib/clickhouse/client";

import { SpanSearchType } from "./types";
import { addTimeRangeToQuery, TimeRange } from "./utils";

export const getSpansCountInProject = async (projectId: string): Promise<{ count: number }[]> => {
  const query = `
    SELECT
      count(*) as count
    FROM spans
    WHERE project_id = {projectId: UUID}
  `;

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: {
      projectId,
    },
  });

  return await result.json();
};

const DEFAULT_LIMIT: number = 1000;

export const searchSpans = async ({
  projectId,
  searchQuery,
  timeRange,
  searchType,
  traceId,
}: {
  projectId?: string;
  searchQuery: string;
  timeRange: TimeRange;
  searchType?: SpanSearchType[];
  traceId?: string;
}): Promise<{
  spanIds: Set<string>;
  traceIds: Set<string>;
}> => {
  const baseQuery = `
    SELECT span_id spanId, trace_id traceId FROM spans
    WHERE
      1 = 1
      ${projectId ? `AND project_id = {projectId: UUID}` : ""}
      AND (
      ${searchTypeToQueryFilter(searchType, "query")}
      )
      ${traceId ? `AND trace_id = {traceId: String}` : ""}
  `;

  const query = addTimeRangeToQuery(baseQuery, timeRange, "start_time");

  const response = await clickhouseClient.query({
    query: `${query}
     ORDER BY spans.start_time DESC
     LIMIT ${DEFAULT_LIMIT}`,
    format: "JSONEachRow",
    query_params: {
      projectId,
      query: `%${searchQuery.toLowerCase()}%`,
      traceId,
    },
  });

  const result = (await response.json()) as { spanId: string; traceId: string }[];
  const traceIds = new Set<string>();
  const spanIds = new Set<string>();
  result.forEach((r) => {
    traceIds.add(r.traceId);
    spanIds.add(r.spanId);
  });
  return { traceIds, spanIds };
};

const searchTypeToQueryFilter = (searchType?: SpanSearchType[], queryParamName: string = "query"): string => {
  const uniqueSearchTypes = Array.from(new Set(searchType));
  const searchBoth = `input_lower LIKE {${queryParamName}: String} OR output_lower LIKE {${queryParamName}: String}`;
  if (uniqueSearchTypes.length === 0) {
    return searchBoth;
  }
  if (uniqueSearchTypes.length === 1) {
    const searchType = uniqueSearchTypes[0];
    switch (searchType) {
      case SpanSearchType.Input:
        return `input_lower LIKE {${queryParamName}: String}`;
      case SpanSearchType.Output:
        return `output_lower LIKE {${queryParamName}: String}`;
      default:
        return searchBoth;
    }
  }
  return searchBoth;
};
