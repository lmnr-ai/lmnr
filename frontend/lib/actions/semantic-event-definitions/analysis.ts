import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { FiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types.ts";
import { searchSpans } from "@/lib/actions/traces/search";
import { buildTracesIdsQueryWithParams, DEFAULT_SEARCH_MAX_HITS } from "@/lib/actions/traces/utils";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { fetcherJSON } from "@/lib/utils";

export const TriggerSemanticEventAnalysisSchema = z.object({
  projectId: z.string(),
  eventDefinitionId: z.string(),
  search: z.string().nullable().optional(),
  ...FiltersSchema.shape,
  ...TimeRangeSchema.shape,
});

export async function triggerSemanticEventAnalysis(
  input: z.infer<typeof TriggerSemanticEventAnalysisSchema>
): Promise<{ success: boolean; message: string }> {
  const {
    projectId,
    eventDefinitionId,
    filter: inputFilters,
    search,
    pastHours,
    startDate,
    endDate,
  } = TriggerSemanticEventAnalysisSchema.parse(input);

  const filters: Filter[] = compact(inputFilters);

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
        projectId,
        traceId: undefined,
        searchQuery: search,
        timeRange: getTimeRange(pastHours, startDate, endDate),
        searchType: [] as SpanSearchType[],
      })
    : [];
  const traceIdsFromSearch = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search && traceIdsFromSearch.length === 0) {
    throw new Error("No traces match your search criteria.");
  }

  const limit = search ? DEFAULT_SEARCH_MAX_HITS : 100000; // Large limit for retroactive analysis

  // Build the trace IDs query using the same logic as getTraces
  const { query: sqlQuery, parameters } = buildTracesIdsQueryWithParams({
    traceType: "DEFAULT",
    filters,
    limit,
    startTime: startDate,
    endTime: endDate,
    pastHours,
  });

  let finalQuery = sqlQuery;
  let finalParameters = { ...parameters };

  if (search && traceIdsFromSearch.length > 0) {
    // Modify the query to include the trace IDs from search
    // The query already has WHERE conditions, so we need to add an AND condition
    const whereClauseEnd = finalQuery.lastIndexOf("ORDER BY");
    const beforeOrderBy = finalQuery.substring(0, whereClauseEnd);
    const orderByClause = finalQuery.substring(whereClauseEnd);

    finalQuery = `${beforeOrderBy} AND id IN ({traceIdsFromSearch:Array(UUID)}) ${orderByClause}`;
    finalParameters = { ...finalParameters, traceIdsFromSearch };
  }

  const response = await fetcherJSON<{ success: boolean; message: string }>(`/projects/${projectId}/trace-analysis`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: finalQuery,
      parameters: finalParameters,
      event_definition_id: eventDefinitionId,
    }),
  });

  return response;
}
