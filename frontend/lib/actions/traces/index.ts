
import { eq } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { searchSpans } from "@/lib/actions/traces/search";
import { buildTracesQueryWithParams } from "@/lib/actions/traces/utils";
import { clickhouseClient } from "@/lib/clickhouse/client.ts";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { clusters } from "@/lib/db/migrations/schema";
import { TraceRow } from "@/lib/traces/types.ts";

import { DEFAULT_SEARCH_MAX_HITS } from "./utils";

const TRACES_TRACE_VIEW_WIDTH = "traces-trace-view-width";
const EVENTS_TRACE_VIEW_WIDTH = "events-trace-view-width";

export const GetTracesSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  traceType: z
    .enum(["DEFAULT", "EVALUATION", "EVENT", "PLAYGROUND"])
    .nullable()
    .optional()
    .transform((val) => val || "DEFAULT"),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export const DeleteTracesSchema = z.object({
  projectId: z.string(),
  traceIds: z.array(z.string()).min(1),
});

export const GetTracesByIdsSchema = z.object({
  projectId: z.string(),
  traceIds: z.array(z.string()).min(1),
});

export async function getTraces(input: z.infer<typeof GetTracesSchema>): Promise<{ items: TraceRow[] }> {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    pageNumber,
    pageSize,
    traceType,
    search,
    searchIn,
    filter: inputFilters,
  } = input;

  const filters: Filter[] = compact(inputFilters);

  let limit = pageSize;
  let offset = Math.max(0, pageNumber * pageSize);

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
      projectId,
      traceId: undefined,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startTime, endTime),
      searchType: searchIn as SpanSearchType[],
    })
    : [];
  let traceIds = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search) {
    if (traceIds?.length === 0) {
      return { items: [] };
    } else {
      // no pagination for search results, use default limit
      limit = DEFAULT_SEARCH_MAX_HITS;
      offset = 0;
    }
  }

  // Resolve pattern names to cluster IDs (lazy - only if pattern filters exist)
  let processedFilters = filters;

  const hasPatternFilter = filters.some((f) => f.column === "pattern");
  if (hasPatternFilter) {
    const clustersList = await db
      .select()
      .from(clusters)
      .where(eq(clusters.projectId, projectId));

    // Replace pattern names with cluster IDs, remove filters for non-existent patterns
    processedFilters = filters
      .map((filter) => {
        if (filter.column === "pattern") {
          const cluster = clustersList.find((c) => c.name === filter.value);
          if (cluster) {
            return { ...filter, value: cluster.id };
          } else {
            // Pattern doesn't exist - log warning and filter it out
            console.warn(`Pattern "${filter.value}" not found in clusters for project ${projectId}`);
            return null;
          }
        }
        return filter;
      })
      .filter((f): f is Filter => f !== null);
  }

  const { query: mainQuery, parameters: mainParams } = buildTracesQueryWithParams({
    projectId,
    traceType,
    traceIds,
    filters: processedFilters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
  });

  const items = await executeQuery<TraceRow>({ query: mainQuery, parameters: mainParams, projectId });

  // If we have traceIds from search, sort items to match the search order
  if (search && traceIds.length > 0) {
    const traceIdIndexMap = new Map(traceIds.map((id, index) => [id, index]));
    items.sort((a, b) => {
      const indexA = traceIdIndexMap.get(a.id) ?? Infinity;
      const indexB = traceIdIndexMap.get(b.id) ?? Infinity;
      return indexA - indexB;
    });
  }

  return {
    items,
  };
}

export async function getTracesByIds(input: z.infer<typeof GetTracesByIdsSchema>): Promise<TraceRow[]> {
  const { projectId, traceIds } = GetTracesByIdsSchema.parse(input);

  if (traceIds.length === 0) {
    return [];
  }

  const query = `
    SELECT
      id,
      formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
      formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
      input_cost as inputCost,
      output_cost as outputCost,
      total_cost as totalCost,
      status
    FROM traces
    WHERE id IN ({traceIds:Array(UUID)})
  `;

  return await executeQuery<TraceRow>({
    query,
    parameters: { projectId, traceIds },
    projectId,
  });
}

export async function deleteTraces(input: z.infer<typeof DeleteTracesSchema>) {
  const { projectId, traceIds } = input;

  await clickhouseClient.command({
    query: `
        DELETE FROM spans
        WHERE project_id = {projectId: UUID} 
            AND trace_id in ({traceIds: Array(UUID)})
      `,
    query_params: {
      traceIds,
      projectId,
    },
  });
}

export { EVENTS_TRACE_VIEW_WIDTH, TRACES_TRACE_VIEW_WIDTH };
