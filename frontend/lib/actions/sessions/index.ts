import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildSessionsQueryWithParams } from "@/lib/actions/sessions/utils";
import { executeQuery } from "@/lib/actions/sql";
import { searchSpans, type SpanSearchHit } from "@/lib/actions/traces/search";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { type SessionRow } from "@/lib/traces/types";

export const GetSessionsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
  sortColumn: z.enum(["start_time", "duration", "total_tokens", "total_cost", "trace_count"]).nullable().optional(),
  sortDirection: z.enum(["ASC", "DESC"]).nullable().optional(),
});

export const DeleteSessionsSchema = z.object({
  projectId: z.guid(),
  sessionIds: z.array(z.string()).min(1),
});

export async function getSessions(input: z.infer<typeof GetSessionsSchema>): Promise<{ items: SessionRow[] }> {
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
    sortColumn,
    sortDirection,
  } = input;

  const filters: Filter[] = compact(inputFilters);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const spanHits: SpanSearchHit[] = search
    ? await searchSpans({
        projectId,
        searchQuery: search,
        timeRange: getTimeRange(pastHours, startTime, endTime),
        searchType: searchIn as SpanSearchType[],
      })
    : [];
  const traceIds = [...new Set(spanHits.map((hit) => hit.trace_id))];

  if (search && traceIds.length === 0) {
    return { items: [] };
  }

  const { query: mainQuery, parameters: mainParams } = buildSessionsQueryWithParams({
    traceIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
    sortColumn: sortColumn ?? undefined,
    sortDirection: sortDirection ?? undefined,
  });

  const items = await executeQuery<Omit<SessionRow, "subRows">>({
    query: mainQuery,
    parameters: mainParams,
    projectId,
  });

  if (items.length > 0) {
    const sessionIds = items.map((s) => s.sessionId);
    // Span ingestion only writes `session_id` on the root span; the cache-read attribute
    // lives on nested LLM spans. Map via traces.id → traces.session_id instead.
    const traceMappings = await executeQuery<{ id: string; sessionId: string }>({
      query: `
        SELECT toString(id) as id, session_id as sessionId
        FROM traces
        WHERE session_id IN ({sessionIds:Array(String)})
      `,
      projectId,
      parameters: { sessionIds },
    });

    if (traceMappings.length > 0) {
      const traceToSession = new Map(traceMappings.map((t) => [t.id, t.sessionId]));
      const traceIds = Array.from(traceToSession.keys());
      const cacheRows = await executeQuery<{ traceId: string; cacheReadInputTokens: number }>({
        query: `
          SELECT
            toString(trace_id) as traceId,
            SUM(simpleJSONExtractUInt(attributes, 'gen_ai.usage.cache_read_input_tokens')) as cacheReadInputTokens
          FROM spans
          WHERE trace_id IN ({traceIds:Array(UUID)})
            AND span_type = 'LLM'
          GROUP BY trace_id
        `,
        projectId,
        parameters: { traceIds },
      });

      const cacheBySession = new Map<string, number>();
      for (const row of cacheRows) {
        const sessionId = traceToSession.get(row.traceId);
        if (!sessionId) continue;
        cacheBySession.set(sessionId, (cacheBySession.get(sessionId) ?? 0) + row.cacheReadInputTokens);
      }
      for (const item of items) {
        item.cacheReadInputTokens = cacheBySession.get(item.sessionId) ?? 0;
      }
    }
  }

  const sessionItems = items.map((item) => ({ ...item, subRows: [] }));

  return { items: sessionItems };
}

export async function deleteSessions(input: z.infer<typeof DeleteSessionsSchema>) {
  const { projectId, sessionIds } = DeleteSessionsSchema.parse(input);

  await clickhouseClient.command({
    query: `
        DELETE FROM spans
        WHERE project_id = {projectId: UUID} 
            AND session_id in ({sessionIds: Array(String)})
      `,
    query_params: {
      sessionIds,
      projectId,
    },
  });
}
