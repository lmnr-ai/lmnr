import { and, eq, inArray } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { searchSpans, type SpanSearchHit } from "@/lib/actions/traces/search";
import {
  buildTracesCountQueryWithParams,
  buildTracesQueryWithParams,
  type CustomColumn,
} from "@/lib/actions/traces/utils";
import { clickhouseClient } from "@/lib/clickhouse/client.ts";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { sharedTraces, traces, tracesAgentChats, tracesAgentMessages } from "@/lib/db/migrations/schema";
import { type TraceRow } from "@/lib/traces/types.ts";

import { DEFAULT_SEARCH_MAX_HITS } from "./utils";

const TRACES_TRACE_VIEW_WIDTH = "traces-trace-view-width";
const EVENTS_TRACE_VIEW_WIDTH = "events-trace-view-width";

export const GetTracesSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  traceType: z
    .enum(["DEFAULT", "EVALUATION", "EVENT", "PLAYGROUND"])
    .nullable()
    .optional()
    .transform((val) => val || "DEFAULT"),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
  sortSql: z.string().optional(),
  customColumns: z.string().optional(),
});

export const DeleteTracesSchema = z.object({
  projectId: z.guid(),
  traceIds: z.array(z.guid()).min(1),
});

export const GetTracesByIdsSchema = z.object({
  projectId: z.guid(),
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
    sortBy,
    sortSql,
    sortDirection,
    customColumns: customColumnsJson,
  } = input;

  const filters: Filter[] = compact(inputFilters);

  let limit = pageSize;
  let offset = Math.max(0, pageNumber * pageSize);

  const spanHits: SpanSearchHit[] = search
    ? await searchSpans({
        projectId,
        searchQuery: search,
        timeRange: getTimeRange(pastHours, startTime, endTime),
        searchType: searchIn as SpanSearchType[],
        getSnippets: true,
      })
    : [];
  const traceIds = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search) {
    if (traceIds?.length === 0) {
      return { items: [] };
    } else {
      // no pagination for search results, use default limit
      limit = DEFAULT_SEARCH_MAX_HITS;
      offset = 0;
    }
  }

  // Parse and validate custom columns from JSON
  let customColumns: CustomColumn[] | undefined;
  if (customColumnsJson) {
    try {
      const parsed = JSON.parse(customColumnsJson);
      const CustomColumnSchema = z.array(
        z.object({
          id: z.string().min(1),
          sql: z.string().min(1),
          filterSql: z.string().optional(),
          dbType: z.string().optional(),
        })
      );
      customColumns = CustomColumnSchema.parse(parsed);
    } catch {
      // ignore malformed custom columns
    }
  }

  const { query: mainQuery, parameters: mainParams } = buildTracesQueryWithParams({
    projectId,
    traceType,
    traceIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
    sortBy,
    sortSql,
    sortDirection: sortDirection as "ASC" | "DESC" | undefined,
    customColumns,
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

    const snippetMap = new Map<string, SpanSearchHit>();
    const snippetsCountMap = new Map<string, number>();
    for (const hit of spanHits) {
      snippetsCountMap.set(hit.trace_id, (snippetsCountMap.get(hit.trace_id) ?? 0) + 1);
      if (!snippetMap.has(hit.trace_id) && (hit.input_snippet || hit.output_snippet || hit.attributes_snippet)) {
        snippetMap.set(hit.trace_id, hit);
      }
    }
    for (const item of items) {
      const hit = snippetMap.get(item.id);
      if (hit) {
        item.inputSnippet = hit.input_snippet;
        item.outputSnippet = hit.output_snippet;
        item.attributesSnippet = hit.attributes_snippet;
      }
      item.snippetsCount = snippetsCountMap.get(item.id) ?? 0;
    }
  }

  return {
    items,
  };
}

export async function countTraces(input: z.infer<typeof GetTracesSchema>): Promise<{ count: number }> {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    traceType,
    search,
    searchIn,
    filter: inputFilters,
  } = input;

  const filters: Filter[] = compact(inputFilters);

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
        projectId,
        searchQuery: search,
        timeRange: getTimeRange(pastHours, startTime, endTime),
        searchType: searchIn as SpanSearchType[],
      })
    : [];
  const traceIds = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search && traceIds?.length === 0) {
    return { count: 0 };
  }

  const { query: countQuery, parameters: countParams } = buildTracesCountQueryWithParams({
    projectId,
    traceType,
    traceIds,
    filters,
    startTime,
    endTime,
    pastHours,
  });

  const result = await executeQuery<{ count: number }>({
    query: countQuery,
    parameters: countParams,
    projectId,
  });

  return {
    count: result[0]?.count ?? 0,
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
  const { projectId, traceIds } = DeleteTracesSchema.parse(input);

  await db.transaction(async (tx) => {
    await tx
      .delete(tracesAgentMessages)
      .where(and(eq(tracesAgentMessages.projectId, projectId), inArray(tracesAgentMessages.traceId, traceIds)));
    await tx
      .delete(tracesAgentChats)
      .where(and(eq(tracesAgentChats.projectId, projectId), inArray(tracesAgentChats.traceId, traceIds)));
    await tx.delete(sharedTraces).where(and(eq(sharedTraces.projectId, projectId), inArray(sharedTraces.id, traceIds)));
    await tx.delete(traces).where(and(eq(traces.projectId, projectId), inArray(traces.id, traceIds)));
  });

  await clickhouseClient.command({
    query: `
      DELETE FROM events_to_clusters
      WHERE project_id = {projectId: UUID}
        AND event_id IN (
          SELECT id
          FROM signal_events
          WHERE project_id = {projectId: UUID}
            AND trace_id IN ({traceIds: Array(UUID)})
        )
    `,
    query_params: {
      traceIds,
      projectId,
    },
    clickhouse_settings: {
      mutations_sync: "1",
    },
  });

  await clickhouseClient.command({
    query: `
      DELETE FROM signal_run_messages
      WHERE project_id = {projectId: UUID}
        AND run_id IN (
          SELECT run_id
          FROM signal_runs FINAL
          WHERE project_id = {projectId: UUID}
            AND trace_id IN ({traceIds: Array(UUID)})
        )
    `,
    query_params: {
      traceIds,
      projectId,
    },
    clickhouse_settings: {
      mutations_sync: "1",
    },
  });

  const clickhouseDeletes = [
    { table: "spans", column: "trace_id" },
    { table: "traces_replacing", column: "id" },
    { table: "trace_tags", column: "trace_id" },
    { table: "trace_summaries", column: "trace_id" },
    { table: "browser_session_events", column: "trace_id" },
    { table: "events", column: "trace_id" },
    { table: "logs", column: "trace_id" },
    { table: "signal_runs", column: "trace_id" },
    { table: "signal_events", column: "trace_id" },
  ];

  for (const { table, column } of clickhouseDeletes) {
    await clickhouseClient.command({
      query: `
        DELETE FROM ${table}
        WHERE project_id = {projectId: UUID}
          AND ${column} IN ({traceIds: Array(UUID)})
      `,
      query_params: {
        traceIds,
        projectId,
      },
      clickhouse_settings: {
        mutations_sync: "1",
      },
    });
  }
}

export { EVENTS_TRACE_VIEW_WIDTH, TRACES_TRACE_VIEW_WIDTH };
